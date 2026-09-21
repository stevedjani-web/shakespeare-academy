import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OccurrencesService } from '../timetable/occurrences.service';
import { AttendanceService } from '../attendance/attendance.service';
import { FinancialStatusService } from '../financial-status/financial-status.service';
import { PaymentsService } from '../payments/payments.service';
import { dayInTimezone } from '../attendance/attendance.util';
import { BulletinsService } from '../grades/bulletins.service';

/**
 * Ce que voit un responsable, en lecture seule (RV08). Chaque route passe par `assertChild` : l'élève doit
 * être rattaché à CE responsable, avec l'accès au portail non retiré. Sinon la réponse est un simple
 * « introuvable », jamais un refus qui confirmerait l'existence de l'élève.
 */
@Injectable()
export class ParentPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occurrences: OccurrencesService,
    private readonly attendance: AttendanceService,
    private readonly financialStatus: FinancialStatusService,
    private readonly payments: PaymentsService,
    private readonly bulletins: BulletinsService,
  ) {}

  private async assertChild(guardianId: string, studentId: string) {
    const link = await this.prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId, guardianId } },
    });
    if (!link || !link.accesPortail) {
      throw new NotFoundException('Élève introuvable.');
    }
  }

  private currentEnrollment(studentId: string) {
    return this.prisma.enrollment.findFirst({
      where: { studentId, statut: 'ACTIVE' },
      orderBy: { academicYear: { dateDebut: 'desc' } },
      include: { class: { select: { id: true, nom: true } }, academicYear: { select: { libelle: true } } },
    });
  }

  async me(guardianId: string) {
    const guardian = await this.prisma.guardian.findUniqueOrThrow({ where: { id: guardianId } });
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId, accesPortail: true },
      include: { student: true },
      orderBy: { student: { nom: 'asc' } },
    });
    const enfants: Array<{ id: string; nom: string; prenom: string; matricule: string; lien: string; classe: string | null; anneeScolaire: string | null }> = [];
    for (const l of links) {
      const enrollment = await this.currentEnrollment(l.studentId);
      enfants.push({
        id: l.studentId,
        nom: l.student.nom,
        prenom: l.student.prenom,
        matricule: l.student.matricule,
        lien: l.lien,
        classe: enrollment?.class.nom ?? null,
        anneeScolaire: enrollment?.academicYear.libelle ?? null,
      });
    }
    return { responsable: { nom: guardian.nom, prenom: guardian.prenom, telephone: guardian.telephone }, enfants };
  }

  /** Emploi du temps de la semaine de la classe de l'enfant (version en vigueur, changements ponctuels compris). */
  async timetable(guardianId: string, studentId: string, date?: string) {
    await this.assertChild(guardianId, studentId);
    const enrollment = await this.currentEnrollment(studentId);
    const school = await this.prisma.school.findFirstOrThrow({ select: { fuseauHoraire: true } });
    const day = date ?? dayInTimezone(new Date(), school.fuseauHoraire);
    if (!enrollment) {
      return { classe: null, debut: day, fin: day, jours: [] };
    }
    const week = await this.occurrences.week(day, { classId: enrollment.classId });
    return {
      classe: enrollment.class.nom,
      debut: week.debut,
      fin: week.fin,
      jours: week.jours.map((j) => ({
        date: j.date,
        sansClasse: j.sansClasse ? { libelle: j.sansClasse.libelle } : null,
        // Le motif d'un changement ponctuel reste interne : le parent voit ce qui change, pas pourquoi.
        seances: j.seances.map((s) => ({
          heureDebut: s.heureDebut,
          heureFin: s.heureFin,
          matiere: s.subjectName,
          enseignant: s.teacherName,
          salle: s.roomName,
          statut: s.statut,
        })),
      })),
    };
  }

  /** Bulletins publiés de l'enfant : jamais les notes en direct, uniquement l'instantané validé et publié. */
  async bulletinsOf(guardianId: string, studentId: string) {
    await this.assertChild(guardianId, studentId);
    return this.bulletins.publishedForStudent(studentId);
  }

  async bulletinOf(guardianId: string, studentId: string, bulletinId: string) {
    await this.assertChild(guardianId, studentId);
    return this.bulletins.publishedDetail(studentId, bulletinId);
  }

  async attendanceOf(guardianId: string, studentId: string) {
    await this.assertChild(guardianId, studentId);
    const history = await this.attendance.studentHistory(studentId);
    return {
      compteurs: history.compteurs,
      lignes: history.lignes.map((l) => ({
        date: l.date,
        heureDebut: l.heureDebut,
        heureFin: l.heureFin,
        matiere: l.matiere,
        statut: l.statut,
        minutesRetard: l.minutesRetard,
        // Ni les corrections internes ni le nom de l'enseignant ne sortent d'ici.
        justificatif: l.justification
          ? { statut: l.justification.statut, motif: l.justification.motif, commentaire: l.justification.commentaire }
          : null,
      })),
    };
  }

  async financeOf(guardianId: string, studentId: string) {
    await this.assertChild(guardianId, studentId);
    const [status, payments] = await Promise.all([
      this.financialStatus.getForStudent(studentId),
      this.payments.findAllForStudent(studentId),
    ]);
    return {
      situation: {
        statut: status.statut,
        montantFacture: status.montantFacture,
        montantRemise: status.montantRemise,
        montantPaye: status.montantPaye,
        montantRestant: status.montantRestant,
        montantExigible: status.montantExigible,
        montantAEchoir: status.montantAEchoir,
        prochaineEcheance: status.prochaineEcheance,
        lignesEnRetard: status.lignesEnRetard.map((l) => ({ libelle: l.libelle, montant: l.montant, dateLimite: l.dateLimite })),
      },
      paiements: payments.map((p) => ({
        id: p.id,
        numeroRecu: p.numeroRecu,
        montant: p.montant,
        modePaiement: p.modePaiement,
        statut: p.statut,
        date: p.datePaiement,
        libelle: p.invoiceLine.libelle,
      })),
    };
  }
}

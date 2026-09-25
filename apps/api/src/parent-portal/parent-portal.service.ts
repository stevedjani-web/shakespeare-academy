import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentsService } from '../documents/documents.service';
import { DisciplineService } from '../discipline/discipline.service';
import { PrismaService } from '../prisma/prisma.service';
import { OccurrencesService } from '../timetable/occurrences.service';
import { AttendanceService } from '../attendance/attendance.service';
import { FinancialStatusService } from '../financial-status/financial-status.service';
import { PaymentsService } from '../payments/payments.service';
import { dayInTimezone } from '../attendance/attendance.util';
import { BulletinsService } from '../grades/bulletins.service';
import { TextbookService } from '../textbook/textbook.service';
import { OnlinePaymentsService } from '../online-payments/online-payments.service';
import type { InitiateOnlinePaymentDto } from '../online-payments/dto/online-payments.dto';
import { pick } from '../common/language';

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
    private readonly textbook: TextbookService,
    private readonly onlinePayments: OnlinePaymentsService,
    private readonly documents: DocumentsService,
    private readonly discipline: DisciplineService,
  ) {}

  private async assertChild(guardianId: string, studentId: string) {
    const link = await this.prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId, guardianId } },
    });
    if (!link || !link.accesPortail) {
      throw new NotFoundException(
        pick({ fr: 'Élève introuvable.', en: 'Student not found.' }),
      );
    }
  }

  private currentEnrollment(studentId: string) {
    return this.prisma.enrollment.findFirst({
      where: { studentId, statut: 'ACTIVE' },
      orderBy: { academicYear: { dateDebut: 'desc' } },
      include: {
        class: { select: { id: true, nom: true } },
        academicYear: { select: { libelle: true } },
      },
    });
  }

  async me(guardianId: string) {
    const guardian = await this.prisma.guardian.findUniqueOrThrow({
      where: { id: guardianId },
    });
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId, accesPortail: true },
      include: { student: true },
      orderBy: { student: { nom: 'asc' } },
    });
    const enfants: Array<{
      id: string;
      nom: string;
      prenom: string;
      matricule: string;
      lien: string | null;
      classe: string | null;
      anneeScolaire: string | null;
    }> = [];
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
    const account = await this.prisma.parentAccount.findUnique({
      where: { guardianId },
      select: { langue: true },
    });
    return {
      responsable: {
        nom: guardian.nom,
        prenom: guardian.prenom,
        telephone: guardian.telephone,
      },
      langue: account?.langue ?? null,
      enfants,
    };
  }

  /** Emploi du temps de la semaine de la classe de l'enfant (version en vigueur, changements ponctuels compris). */
  async timetable(guardianId: string, studentId: string, date?: string) {
    await this.assertChild(guardianId, studentId);
    const enrollment = await this.currentEnrollment(studentId);
    const school = await this.prisma.school.findFirstOrThrow({
      select: { fuseauHoraire: true },
    });
    const day = date ?? dayInTimezone(new Date(), school.fuseauHoraire);
    if (!enrollment) {
      return { classe: null, debut: day, fin: day, jours: [] };
    }
    const week = await this.occurrences.week(day, {
      classId: enrollment.classId,
    });
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

  /** Vie scolaire de l'enfant : sanctions publiées, convocations, valorisations (liste blanche, jamais le récit). */
  async disciplineOf(guardianId: string, studentId: string) {
    await this.assertChild(guardianId, studentId);
    return this.discipline.portalView(studentId);
  }

  async acknowledgeConvocation(
    guardianId: string,
    studentId: string,
    convocationId: string,
  ) {
    await this.assertChild(guardianId, studentId);
    return this.discipline.acknowledgeConvocation(
      guardianId,
      studentId,
      convocationId,
    );
  }

  /**
   * Attestation de scolarité de l'enfant, émise à la demande du responsable : la même que celle du secrétariat
   * (idempotent : un même numéro tant qu'elle n'est pas renouvelée). La carte d'élève, avec photo, reste au secrétariat.
   */
  async attestationOf(guardianId: string, studentId: string) {
    await this.assertChild(guardianId, studentId);
    return this.documents.issue(studentId, 'ATTESTATION_SCOLARITE', {
      type: 'PARENT',
      id: guardianId,
    });
  }

  /** Cahier de textes de la classe de l'enfant : devoirs à rendre d'abord, puis les 14 derniers jours (lecture seule). */
  async textbookOf(guardianId: string, studentId: string) {
    await this.assertChild(guardianId, studentId);
    return this.textbook.forStudent(studentId);
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
          ? {
              statut: l.justification.statut,
              motif: l.justification.motif,
              commentaire: l.justification.commentaire,
            }
          : null,
      })),
    };
  }

  async financeOf(guardianId: string, studentId: string) {
    await this.assertChild(guardianId, studentId);
    const [status, payments, online] = await Promise.all([
      this.financialStatus.getForStudent(studentId),
      this.payments.findAllForStudent(studentId),
      this.onlinePayments.overview(studentId),
    ]);
    return {
      // Lot 17 : le parent peut payer une tranche si l'école a activé le paiement en ligne.
      paiementEnLigne: online.paiementEnLigne,
      tranches: online.tranches,
      situation: {
        statut: status.statut,
        montantFacture: status.montantFacture,
        montantRemise: status.montantRemise,
        montantPaye: status.montantPaye,
        montantRestant: status.montantRestant,
        montantExigible: status.montantExigible,
        montantAEchoir: status.montantAEchoir,
        prochaineEcheance: status.prochaineEcheance,
        lignesEnRetard: status.lignesEnRetard.map((l) => ({
          libelle: l.libelle,
          montant: l.montant,
          dateLimite: l.dateLimite,
        })),
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

  /** Lance le paiement d'une tranche de l'enfant (Mobile Money). */
  async payTranche(
    guardianId: string,
    studentId: string,
    dto: InitiateOnlinePaymentDto,
  ) {
    await this.assertChild(guardianId, studentId);
    return this.onlinePayments.initiate(guardianId, studentId, dto);
  }

  /** État d'un paiement lancé par ce responsable (sondé par l'écran). */
  onlinePaymentStatus(guardianId: string, id: string) {
    return this.onlinePayments.getForGuardian(guardianId, id);
  }

  /** Reçu d'un paiement de l'enfant. */
  async receiptOf(guardianId: string, studentId: string, paymentId: string) {
    await this.assertChild(guardianId, studentId);
    return this.onlinePayments.receiptForStudent(studentId, paymentId);
  }
}

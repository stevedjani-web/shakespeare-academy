import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';
import { FinancialStatusService } from '../financial-status/financial-status.service';

function startOfDay(date: string): Date {
  const d = new Date(`${date}T00:00:00.000Z`);
  return d;
}
function nextDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schoolService: SchoolService,
    private readonly financialStatusService: FinancialStatusService,
  ) {}

  /**
   * Clôture de journée : entrées (paiements VALIDE), sorties (dépenses APPROUVEE), solde du jour et
   * solde cumulé (toutes entrées - toutes sorties, jamais une session de caisse formelle avec fonds
   * initial — D20-D23 restent OUVERT, non implémentées). Une dépense EN_ATTENTE/REJETEE n'est jamais
   * comptée : seule une sortie réellement validée par Direction représente un vrai décaissement.
   */
  async getCashClosing(date: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const dayStart = startOfDay(date);
    const dayEnd = nextDay(dayStart);

    const [payments, expenses, allPaymentsAgg, allExpensesAgg] = await Promise.all([
      this.prisma.payment.findMany({
        where: { schoolId, statut: 'VALIDE', datePaiement: { gte: dayStart, lt: dayEnd } },
        include: {
          invoiceLine: {
            include: {
              invoice: { include: { enrollment: { include: { student: true } } } },
            },
          },
          recuParUser: { select: { nom: true, prenom: true } },
        },
        orderBy: { datePaiement: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: { schoolId, statut: 'APPROUVEE', dateDepense: { gte: dayStart, lt: dayEnd } },
        include: { effectuePar: { select: { nom: true, prenom: true } } },
        orderBy: { dateDepense: 'asc' },
      }),
      this.prisma.payment.aggregate({
        where: { schoolId, statut: 'VALIDE', datePaiement: { lt: dayEnd } },
        _sum: { montant: true },
      }),
      this.prisma.expense.aggregate({
        where: { schoolId, statut: 'APPROUVEE', dateDepense: { lt: dayEnd } },
        _sum: { montant: true },
      }),
    ]);

    const totalEntrees = payments.reduce((sum, p) => sum + p.montant, 0);
    const totalSorties = expenses.reduce((sum, e) => sum + e.montant, 0);
    const parMode = { ESPECES: 0, MOBILE_MONEY: 0 };
    for (const p of payments) parMode[p.modePaiement] += p.montant;
    const parCategorie: Record<string, number> = {};
    for (const e of expenses) parCategorie[e.categorie] = (parCategorie[e.categorie] ?? 0) + e.montant;

    return {
      date,
      entrees: {
        total: totalEntrees,
        count: payments.length,
        parMode,
        items: payments.map((p) => ({
          id: p.id,
          numeroRecu: p.numeroRecu,
          montant: p.montant,
          modePaiement: p.modePaiement,
          datePaiement: p.datePaiement,
          libelle: p.invoiceLine.libelle,
          eleve: p.invoiceLine.invoice.enrollment.student
            ? `${p.invoiceLine.invoice.enrollment.student.prenom} ${p.invoiceLine.invoice.enrollment.student.nom}`
            : null,
          recuPar: `${p.recuParUser.prenom} ${p.recuParUser.nom}`,
        })),
      },
      sorties: {
        total: totalSorties,
        count: expenses.length,
        parCategorie,
        items: expenses.map((e) => ({
          id: e.id,
          categorie: e.categorie,
          montant: e.montant,
          description: e.description,
          dateDepense: e.dateDepense,
          effectuePar: `${e.effectuePar.prenom} ${e.effectuePar.nom}`,
        })),
      },
      soldeJour: totalEntrees - totalSorties,
      soldeCumule: (allPaymentsAgg._sum.montant ?? 0) - (allExpensesAgg._sum.montant ?? 0),
    };
  }

  /**
   * État des élèves insolvables (EN_RETARD ou IMPAYE_CRITIQUE) — jamais un statut saisi, toujours
   * recalculé via `FinancialStatusService`, la même logique que le dossier élève individuel.
   * Complexité N+1 assumée : effectif d'une école pilote, pas un rapport temps réel à grande échelle.
   */
  async getInsolventStudents() {
    const schoolId = await this.schoolService.getDefaultId();
    const students = await this.prisma.student.findMany({
      where: { schoolId, statut: 'ACTIF' },
      include: {
        enrollments: {
          where: { statut: 'ACTIVE' },
          include: { class: { select: { nom: true } }, academicYear: { select: { libelle: true } } },
        },
        studentGuardians: {
          where: { prioritaire: true },
          include: { guardian: { select: { nom: true, prenom: true, telephone: true } } },
          take: 1,
        },
      },
    });

    const results: Array<{
      student: { id: string; nom: string; prenom: string; matricule: string };
      classe: string | null;
      guardian: { nom: string; telephone: string } | null;
      statut: string;
      montantExigible: number;
      montantRestant: number;
      prochaineEcheance: unknown;
    }> = [];
    for (const student of students) {
      const status = await this.financialStatusService.getForStudent(student.id);
      if (status.statut !== 'EN_RETARD' && status.statut !== 'IMPAYE_CRITIQUE') continue;
      const enrollment = student.enrollments[0];
      const guardian = student.studentGuardians[0]?.guardian;
      results.push({
        student: { id: student.id, nom: student.nom, prenom: student.prenom, matricule: student.matricule },
        classe: enrollment ? `${enrollment.class.nom} (${enrollment.academicYear.libelle})` : null,
        guardian: guardian ? { nom: `${guardian.prenom} ${guardian.nom}`, telephone: guardian.telephone } : null,
        statut: status.statut,
        montantExigible: status.montantExigible,
        montantRestant: status.montantRestant,
        prochaineEcheance: status.prochaineEcheance,
      });
    }

    results.sort((a, b) => b.montantExigible - a.montantExigible);
    return results;
  }
}

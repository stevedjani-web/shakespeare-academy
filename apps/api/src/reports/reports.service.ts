import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';
import { FinancialStatusService } from '../financial-status/financial-status.service';
import { computeApprovedDiscountAmount } from '../discounts/discount-amount.util';
import { toCsv } from '../common/csv.util';

function startOfDay(date: string): Date {
  const d = new Date(`${date}T00:00:00.000Z`);
  return d;
}
function nextDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

interface ProchaineEcheance {
  libelle: string;
  montant: number;
  dateLimite: Date;
}

function formatProchaineEcheance(value: unknown): string {
  if (!value || typeof value !== 'object' || !('libelle' in value)) return '';
  const e = value as ProchaineEcheance;
  const date = new Date(e.dateLimite).toISOString().slice(0, 10);
  return `${e.libelle} (${date})`;
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

    const [payments, expenses, allPaymentsAgg, allExpensesAgg] =
      await Promise.all([
        this.prisma.payment.findMany({
          where: {
            schoolId,
            statut: 'VALIDE',
            datePaiement: { gte: dayStart, lt: dayEnd },
          },
          include: {
            invoiceLine: {
              include: {
                invoice: {
                  include: { enrollment: { include: { student: true } } },
                },
              },
            },
            recuParUser: { select: { nom: true, prenom: true } },
          },
          orderBy: { datePaiement: 'asc' },
        }),
        this.prisma.expense.findMany({
          where: {
            schoolId,
            statut: 'APPROUVEE',
            dateDepense: { gte: dayStart, lt: dayEnd },
          },
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
    for (const e of expenses)
      parCategorie[e.categorie] = (parCategorie[e.categorie] ?? 0) + e.montant;

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
          recuPar: p.recuParUser
            ? `${p.recuParUser.prenom} ${p.recuParUser.nom}`
            : 'Paiement en ligne',
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
      soldeCumule:
        (allPaymentsAgg._sum.montant ?? 0) - (allExpensesAgg._sum.montant ?? 0),
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
          include: {
            class: { select: { nom: true } },
            academicYear: { select: { libelle: true } },
          },
        },
        studentGuardians: {
          where: { prioritaire: true },
          include: {
            guardian: { select: { nom: true, prenom: true, telephone: true } },
          },
          take: 1,
        },
      },
    });

    const results: Array<{
      student: { id: string; nom: string; prenom: string; matricule: string };
      classe: string | null;
      guardian: { nom: string; telephone: string | null } | null;
      statut: string;
      montantExigible: number;
      montantRestant: number;
      prochaineEcheance: unknown;
    }> = [];
    for (const student of students) {
      const status = await this.financialStatusService.getForStudent(
        student.id,
      );
      if (status.statut !== 'EN_RETARD' && status.statut !== 'IMPAYE_CRITIQUE')
        continue;
      const enrollment = student.enrollments[0];
      const guardian = student.studentGuardians[0]?.guardian;
      results.push({
        student: {
          id: student.id,
          nom: student.nom,
          prenom: student.prenom,
          matricule: student.matricule,
        },
        classe: enrollment
          ? `${enrollment.class.nom} (${enrollment.academicYear.libelle})`
          : null,
        guardian: guardian
          ? {
              // Nom/prénom facultatifs (22 septembre 2026) : jamais littéralement "null" affiché.
              nom:
                [guardian.prenom, guardian.nom]
                  .filter((v): v is string => !!v?.trim())
                  .join(' ') || 'Responsable',
              telephone: guardian.telephone,
            }
          : null,
        statut: status.statut,
        montantExigible: status.montantExigible,
        montantRestant: status.montantRestant,
        prochaineEcheance: status.prochaineEcheance,
      });
    }

    results.sort((a, b) => b.montantExigible - a.montantExigible);
    return results;
  }

  /**
   * Statistiques agrégées du tableau de bord — tout ce qui est réellement calculable à partir des
   * données existantes (jamais un chiffre inventé faute de donnée : un taux de recouvrement sans
   * aucune facture reste `null`, jamais 0% ou 100%). Scopé à l'année scolaire ACTIVE pour tout ce
   * qui est lié aux inscriptions/factures (une école n'a normalement qu'une année active à la
   * fois) ; les cumuls de caisse (paiements/dépenses) restent depuis le début, cohérent avec
   * `getCashClosing()`. Complexité N+1 assumée par endroits (`getInsolventStudents()`) — même
   * principe déjà accepté ailleurs dans ce fichier pour un effectif d'école pilote.
   */
  async getDashboardStats() {
    const schoolId = await this.schoolService.getDefaultId();

    const [
      academicYears,
      students,
      expensesApprouveesAgg,
      expensesEnAttente,
      discountCounts,
      cashClosing,
      insolvents,
    ] = await Promise.all([
      this.prisma.academicYear.findMany({ where: { schoolId } }),
      this.prisma.student.findMany({
        where: { schoolId },
        select: { sexe: true, statut: true },
      }),
      this.prisma.expense.aggregate({
        where: { schoolId, statut: 'APPROUVEE' },
        _sum: { montant: true },
      }),
      this.prisma.expense.aggregate({
        where: { schoolId, statut: 'EN_ATTENTE' },
        _sum: { montant: true },
        _count: true,
      }),
      this.prisma.discount.groupBy({
        by: ['statut'],
        where: { invoiceLine: { invoice: { schoolId } } },
        _count: true,
      }),
      this.getCashClosing(new Date().toISOString().slice(0, 10)),
      this.getInsolventStudents(),
    ]);

    const activeYear = academicYears.find((y) => y.statut === 'ACTIVE') ?? null;

    const effectifs = {
      total: students.length,
      actifs: students.filter((s) => s.statut === 'ACTIF').length,
      inactifs: students.filter((s) => s.statut !== 'ACTIF').length,
      parSexe: {
        M: students.filter((s) => s.statut === 'ACTIF' && s.sexe === 'M')
          .length,
        F: students.filter((s) => s.statut === 'ACTIF' && s.sexe === 'F')
          .length,
      },
    };

    let repartition = {
      parSection: [] as Array<{ nom: string; effectif: number }>,
      parClasse: [] as Array<{
        nom: string;
        cycle: string;
        section: string;
        effectif: number;
      }>,
    };
    const inscriptions = { nouvelles: 0, reinscriptions: 0, annulees: 0 };
    const financier = {
      totalFacture: 0,
      totalRemises: 0,
      totalEncaisse: 0,
      totalRestantDu: 0,
      tauxRecouvrement: null as number | null,
      soldeCaisseCumule: cashClosing.soldeCumule,
    };
    const parModePaiement = { ESPECES: 0, MOBILE_MONEY: 0 };

    if (activeYear) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { schoolId, academicYearId: activeYear.id },
        include: {
          class: {
            include: {
              level: { include: { cycle: { include: { section: true } } } },
            },
          },
          invoice: {
            include: {
              lines: {
                include: {
                  discounts: true,
                  payments: { where: { statut: 'VALIDE' } },
                },
              },
            },
          },
        },
      });

      const bySection = new Map<string, number>();
      const byClasse = new Map<
        string,
        { nom: string; cycle: string; section: string; effectif: number }
      >();

      for (const e of enrollments) {
        if (e.statut === 'ANNULEE') {
          inscriptions.annulees++;
          continue;
        }
        if (e.type === 'INSCRIPTION') inscriptions.nouvelles++;
        else inscriptions.reinscriptions++;

        const sectionNom = e.class.level.cycle.section.nom;
        bySection.set(sectionNom, (bySection.get(sectionNom) ?? 0) + 1);
        const classeKey = e.classId;
        const existing = byClasse.get(classeKey);
        if (existing) existing.effectif++;
        else
          byClasse.set(classeKey, {
            nom: e.class.nom,
            cycle: e.class.level.cycle.nom,
            section: sectionNom,
            effectif: 1,
          });

        if (e.invoice) {
          for (const line of e.invoice.lines) {
            financier.totalFacture += line.montant;
            financier.totalRemises += computeApprovedDiscountAmount(
              line,
              line.discounts,
            );
            for (const p of line.payments) {
              financier.totalEncaisse += p.montant;
              parModePaiement[p.modePaiement] += p.montant;
            }
          }
        }
      }

      financier.totalRestantDu =
        financier.totalFacture -
        financier.totalRemises -
        financier.totalEncaisse;
      const netAFacturer = financier.totalFacture - financier.totalRemises;
      financier.tauxRecouvrement =
        netAFacturer > 0
          ? Math.round((financier.totalEncaisse / netAFacturer) * 100)
          : null;

      repartition = {
        parSection: Array.from(bySection, ([nom, effectif]) => ({
          nom,
          effectif,
        })),
        parClasse: Array.from(byClasse.values()).sort((a, b) =>
          a.nom.localeCompare(b.nom, 'fr'),
        ),
      };
    }

    const remises = {
      enAttente:
        discountCounts.find((d) => d.statut === 'EN_ATTENTE')?._count ?? 0,
      approuvees:
        discountCounts.find((d) => d.statut === 'APPROUVEE')?._count ?? 0,
      rejetees: discountCounts.find((d) => d.statut === 'REJETEE')?._count ?? 0,
    };

    return {
      anneeActive: activeYear?.libelle ?? null,
      effectifs,
      repartition,
      inscriptions,
      financier,
      paiements: { parMode: parModePaiement },
      remises,
      depenses: {
        totalApprouve: expensesApprouveesAgg._sum.montant ?? 0,
        enAttenteCount: expensesEnAttente._count,
        enAttenteMontant: expensesEnAttente._sum.montant ?? 0,
      },
      insolvables: { count: insolvents.length },
    };
  }

  /** Liste des élèves avec leur classe active, triée par section/cycle/classe/nom. */
  async getStudentsByClass() {
    const schoolId = await this.schoolService.getDefaultId();
    const students = await this.prisma.student.findMany({
      where: { schoolId },
      include: {
        enrollments: {
          where: { statut: 'ACTIVE' },
          include: {
            class: {
              include: {
                level: { include: { cycle: { include: { section: true } } } },
              },
            },
            academicYear: { select: { libelle: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        studentGuardians: {
          where: { prioritaire: true },
          include: {
            guardian: { select: { nom: true, prenom: true, telephone: true } },
          },
          take: 1,
        },
      },
    });

    const rows = students.map((s) => {
      const enrollment = s.enrollments[0];
      const guardian = s.studentGuardians[0]?.guardian;
      return {
        id: s.id,
        section: enrollment?.class.level.cycle.section.nom ?? '',
        cycle: enrollment?.class.level.cycle.nom ?? '',
        classe: enrollment?.class.nom ?? '',
        annee: enrollment?.academicYear.libelle ?? '',
        matricule: s.matricule,
        nom: s.nom,
        prenom: s.prenom,
        sexe: s.sexe,
        dateNaissance: s.dateNaissance
          ? s.dateNaissance.toISOString().slice(0, 10)
          : '',
        statut: s.statut,
        responsable: guardian ? `${guardian.prenom} ${guardian.nom}` : '',
        telephoneResponsable: guardian?.telephone ?? '',
      };
    });

    rows.sort(
      (a, b) =>
        a.section.localeCompare(b.section, 'fr') ||
        a.cycle.localeCompare(b.cycle, 'fr') ||
        a.classe.localeCompare(b.classe, 'fr') ||
        a.nom.localeCompare(b.nom, 'fr'),
    );

    return rows;
  }

  /** Export CSV des élèves, triés par section/cycle/classe. */
  async exportStudentsByClass(): Promise<string> {
    const rows = await this.getStudentsByClass();
    return toCsv(rows, [
      { key: 'section', label: 'Section' },
      { key: 'cycle', label: 'Cycle' },
      { key: 'classe', label: 'Classe' },
      { key: 'annee', label: 'Année scolaire' },
      { key: 'matricule', label: 'Matricule' },
      { key: 'nom', label: 'Nom' },
      { key: 'prenom', label: 'Prénom' },
      { key: 'sexe', label: 'Sexe' },
      { key: 'dateNaissance', label: 'Date de naissance' },
      { key: 'statut', label: 'Statut' },
      { key: 'responsable', label: 'Responsable' },
      { key: 'telephoneResponsable', label: 'Téléphone responsable' },
    ]);
  }

  /** Export CSV des élèves insolvables — mêmes données que GET /reports/insolvent-students. */
  async exportInsolventStudents(): Promise<string> {
    const insolvents = await this.getInsolventStudents();
    const rows = insolvents.map((r) => ({
      matricule: r.student.matricule,
      nom: r.student.nom,
      prenom: r.student.prenom,
      classe: r.classe ?? '',
      responsable: r.guardian?.nom ?? '',
      telephoneResponsable: r.guardian?.telephone ?? '',
      statut: r.statut,
      montantExigible: r.montantExigible,
      montantRestant: r.montantRestant,
      prochaineEcheance: formatProchaineEcheance(r.prochaineEcheance),
    }));

    return toCsv(rows, [
      { key: 'matricule', label: 'Matricule' },
      { key: 'nom', label: 'Nom' },
      { key: 'prenom', label: 'Prénom' },
      { key: 'classe', label: 'Classe' },
      { key: 'responsable', label: 'Responsable' },
      { key: 'telephoneResponsable', label: 'Téléphone responsable' },
      { key: 'statut', label: 'Statut' },
      { key: 'montantExigible', label: 'Montant exigible (XAF)' },
      { key: 'montantRestant', label: 'Montant restant (XAF)' },
      { key: 'prochaineEcheance', label: 'Prochaine échéance' },
    ]);
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { dayInTimezone } from '../attendance/attendance.util';
import { isoDay, toDateOnly } from '../timetable/timetable.util';
import { SellCanteenDto } from './dto/canteen.dto';
import {
  closureOn,
  daysOfMonth,
  isCanteenWeekday,
  isValidDay,
  isValidMonth,
  saleLabel,
  type Closure,
} from './canteen.util';

export const CANTEEN_FEE_CODE = 'CANTINE';
const RECEIPT_NUMERO_DIGITS = 6;

@Injectable()
export class CanteenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  /** Réglages de la cantine de l'école (tels que l'écran les lit). */
  private settingsOf(school: {
    cantineActive: boolean;
    cantinePrixJourFcfa: number;
    cantineJours: number[];
    joursClasse: number[];
  }) {
    return {
      actif: school.cantineActive,
      prixJour: school.cantinePrixJourFcfa,
      jours: [...school.cantineJours].sort((a, b) => a - b),
      joursClasse: school.joursClasse,
    };
  }

  private async yearContext(schoolId: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, statut: 'ACTIVE' },
    });
    if (!year) return null;
    const events = await this.prisma.calendarEvent.findMany({
      where: { academicYearId: year.id },
    });
    const closures: Closure[] = events.map((e) => ({
      debut: isoDay(e.dateDebut),
      fin: isoDay(e.dateFin),
      libelle: e.libelle,
    }));
    return {
      year,
      debut: isoDay(year.dateDebut),
      fin: isoDay(year.dateFin),
      closures,
    };
  }

  private async activeEnrollment(schoolId: string, studentId: string) {
    return this.prisma.enrollment.findFirst({
      where: {
        schoolId,
        studentId,
        statut: 'ACTIVE',
        academicYear: { statut: 'ACTIVE' },
        invoice: { is: { statut: 'EMISE' } },
      },
      include: {
        invoice: { include: { lines: { select: { ordre: true } } } },
        class: { select: { id: true, nom: true } },
      },
    });
  }

  private async studentOrThrow(schoolId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { id: true, nom: true, prenom: true, matricule: true },
    });
    if (!student) throw new NotFoundException('Élève introuvable.');
    return student;
  }

  /**
   * La cantine d'un élève : réglages, jours du mois avec leur état (libre, payé, fermé) et ses achats. `month` ("AAAA-MM")
   * vaut le mois courant par défaut. Un jour payé puis déclaré sans classe est signalé `ferme` (décision du 30 octobre :
   * pas de report automatique, la Direction décide du remboursement hors application).
   */
  async studentOverview(studentId: string, month?: string) {
    const school = await this.schoolService.getDefault();
    const student = await this.studentOrThrow(school.id, studentId);
    const settings = this.settingsOf(school);
    const ctx = await this.yearContext(school.id);
    const enrollment = await this.activeEnrollment(school.id, studentId);

    const today = dayInTimezone(new Date(), school.fuseauHoraire);
    const wanted = month ?? today.slice(0, 7);
    if (!isValidMonth(wanted)) {
      throw new BadRequestException('Mois invalide (AAAA-MM attendu).');
    }

    let venteImpossible: string | null = null;
    if (!settings.actif) venteImpossible = 'CANTINE_INACTIVE';
    else if (!ctx) venteImpossible = 'AUCUNE_ANNEE_ACTIVE';
    else if (!enrollment) venteImpossible = 'AUCUNE_INSCRIPTION';

    const paid = enrollment
      ? await this.prisma.canteenDay.findMany({
          where: { enrollmentId: enrollment.id },
          select: { date: true },
        })
      : [];
    const paidSet = new Set(paid.map((p) => isoDay(p.date)));

    const jours = ctx
      ? daysOfMonth(wanted)
          .filter(
            (d) =>
              d >= ctx.debut &&
              d <= ctx.fin &&
              isCanteenWeekday(d, settings.jours, settings.joursClasse),
          )
          .map((d) => {
            const closure = closureOn(d, ctx.closures);
            return {
              date: d,
              paye: paidSet.has(d),
              ferme: closure !== null,
              motifFermeture: closure?.libelle ?? null,
            };
          })
      : [];

    const achats = enrollment?.invoice
      ? await this.purchasesOf(enrollment.invoice.id)
      : [];

    return {
      eleve: student,
      cantine: settings,
      mois: wanted,
      anneeDebut: ctx?.debut ?? null,
      anneeFin: ctx?.fin ?? null,
      aujourdhui: today,
      venteImpossible,
      jours,
      achats,
    };
  }

  /** Les ventes de cantine d'une facture : ligne, reçu et jours (une vente annulée garde sa ligne, sans jours). */
  private async purchasesOf(invoiceId: string) {
    const lines = await this.prisma.invoiceLine.findMany({
      where: { invoiceId, feeType: { code: CANTEEN_FEE_CODE } },
      include: {
        canteenDays: { select: { date: true }, orderBy: { date: 'asc' } },
        payments: {
          select: {
            id: true,
            numeroRecu: true,
            datePaiement: true,
            modePaiement: true,
            montant: true,
            statut: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return lines.map((l) => {
      const payment =
        l.payments.find((p) => p.statut === 'VALIDE') ??
        l.payments[l.payments.length - 1] ??
        null;
      return {
        ligneId: l.id,
        libelle: l.libelle,
        montant: l.montant,
        annulee: l.annuleeAt !== null,
        paiement: payment,
        jours: l.canteenDays.map((d) => isoDay(d.date)),
      };
    });
  }

  /** Vente de jours de cantine : ligne de facture, jours payés, paiement et reçu, dans une seule transaction. */
  async sell(studentId: string, dto: SellCanteenDto, actingUserId: string) {
    const school = await this.schoolService.getDefault();
    const settings = this.settingsOf(school);
    if (!settings.actif) {
      throw new ConflictException("La cantine n'est pas activée.");
    }
    await this.studentOrThrow(school.id, studentId);
    const ctx = await this.yearContext(school.id);
    if (!ctx) {
      throw new UnprocessableEntityException(
        "Aucune année scolaire n'est active.",
      );
    }
    const enrollment = await this.activeEnrollment(school.id, studentId);
    if (!enrollment || !enrollment.invoice) {
      throw new UnprocessableEntityException(
        "Cet élève n'a pas d'inscription active cette année : la cantine ne peut pas lui être vendue.",
      );
    }
    const invoice = enrollment.invoice;
    if (dto.modePaiement === 'MOBILE_MONEY' && !dto.referenceExterne?.trim()) {
      throw new BadRequestException(
        'La référence de la transaction est obligatoire pour un paiement Mobile Money.',
      );
    }

    const days = [...new Set(dto.dates)].sort();
    for (const d of days) {
      if (!isValidDay(d)) {
        throw new BadRequestException(`Jour invalide : ${d}.`);
      }
      if (d < ctx.debut || d > ctx.fin) {
        throw new BadRequestException(
          `Le ${d} est en dehors de l'année scolaire.`,
        );
      }
      if (!isCanteenWeekday(d, settings.jours, settings.joursClasse)) {
        throw new BadRequestException(`Le ${d} n'est pas un jour de cantine.`);
      }
      const closure = closureOn(d, ctx.closures);
      if (closure) {
        throw new BadRequestException(
          `Le ${d} est un jour sans classe (${closure.libelle}).`,
        );
      }
    }
    const already = await this.prisma.canteenDay.findMany({
      where: {
        enrollmentId: enrollment.id,
        date: { in: days.map((d) => toDateOnly(d)) },
      },
      select: { date: true },
    });
    if (already.length > 0) {
      throw new ConflictException(
        `Déjà payé : ${already.map((a) => isoDay(a.date)).join(', ')}.`,
      );
    }

    const prix = settings.prixJour;
    const total = days.length * prix;
    if (dto.totalAttendu !== total) {
      throw new ConflictException(
        `Le total a changé : ${days.length} jour(s) × ${prix} = ${total} XAF. Vérifiez et validez à nouveau.`,
      );
    }

    const feeType = await this.prisma.feeType.upsert({
      where: {
        schoolId_code: { schoolId: school.id, code: CANTEEN_FEE_CODE },
      },
      create: {
        schoolId: school.id,
        code: CANTEEN_FEE_CODE,
        nom: 'Cantine',
        obligatoire: false,
        avecTranches: false,
      },
      update: {},
    });

    const ordreMax = invoice.lines.reduce(
      (max, l) => Math.max(max, l.ordre),
      0,
    );

    let outcome: {
      line: { id: string; libelle: string };
      payment: { id: string; numeroRecu: string };
    };
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const line = await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            feeTypeId: feeType.id,
            libelle: saleLabel(days),
            montant: total,
            dateEcheance: null,
            delaiGraceJours: 0,
            ordre: ordreMax + 1,
          },
        });
        await tx.canteenDay.createMany({
          data: days.map((d) => ({
            schoolId: school.id,
            enrollmentId: enrollment.id,
            invoiceLineId: line.id,
            date: toDateOnly(d),
            prixFcfa: prix,
          })),
        });
        // Numéro de reçu attribué DANS la transaction : si elle échoue, aucun numéro n'est consommé (RG10).
        const sequence = await tx.numberSequence.upsert({
          where: {
            schoolId_type_scope: {
              schoolId: school.id,
              type: 'RECEIPT',
              scope: '',
            },
          },
          create: {
            schoolId: school.id,
            type: 'RECEIPT',
            scope: '',
            dernierNumero: 1,
          },
          update: { dernierNumero: { increment: 1 } },
        });
        const payment = await tx.payment.create({
          data: {
            schoolId: school.id,
            invoiceLineId: line.id,
            montant: total,
            modePaiement: dto.modePaiement,
            referenceExterne:
              dto.modePaiement === 'MOBILE_MONEY'
                ? dto.referenceExterne!.trim()
                : null,
            numeroRecu: `REC-${String(sequence.dernierNumero).padStart(RECEIPT_NUMERO_DIGITS, '0')}`,
            recuParUserId: actingUserId,
          },
        });
        return { line, payment };
      });
    } catch (e) {
      // Deux ventes simultanées sur le même jour : la contrainte d'unicité en laisse passer une seule.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'Un de ces jours vient d’être payé : rechargez la page.',
        );
      }
      throw e;
    }

    await this.audit.log({
      schoolId: school.id,
      userId: actingUserId,
      action: 'CANTEEN_SALE',
      entite: 'Payment',
      entiteId: outcome.payment.id,
      nouvelleValeur: {
        paymentId: outcome.payment.id,
        numeroRecu: outcome.payment.numeroRecu,
        invoiceLineId: outcome.line.id,
        enrollmentId: enrollment.id,
        montant: total,
        prixJour: prix,
        nombreJours: days.length,
        premier: days[0],
        dernier: days[days.length - 1],
        modePaiement: dto.modePaiement,
      },
    });

    return {
      paiementId: outcome.payment.id,
      numeroRecu: outcome.payment.numeroRecu,
      ligneId: outcome.line.id,
      libelle: outcome.line.libelle,
      montant: total,
      nombreJours: days.length,
      jours: days,
    };
  }

  /** Les enfants attendus à la cantine un jour donné, par classe (aucune donnée financière). */
  async daily(date?: string) {
    const school = await this.schoolService.getDefault();
    const settings = this.settingsOf(school);
    const day = date ?? dayInTimezone(new Date(), school.fuseauHoraire);
    if (!isValidDay(day)) {
      throw new BadRequestException('Date invalide (AAAA-MM-JJ attendu).');
    }
    const ctx = await this.yearContext(school.id);
    const closure = ctx ? closureOn(day, ctx.closures) : null;
    const estJourCantine = isCanteenWeekday(
      day,
      settings.jours,
      settings.joursClasse,
    );

    const rows = await this.prisma.canteenDay.findMany({
      where: {
        schoolId: school.id,
        date: toDateOnly(day),
        enrollment: { statut: 'ACTIVE', student: { statut: 'ACTIF' } },
      },
      include: {
        enrollment: {
          include: {
            student: {
              select: { id: true, nom: true, prenom: true, matricule: true },
            },
            class: {
              select: {
                id: true,
                nom: true,
                level: {
                  select: {
                    ordre: true,
                    cycle: {
                      select: {
                        ordre: true,
                        section: { select: { nom: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    interface Bucket {
      classeId: string;
      classe: string;
      section: string;
      cycleOrdre: number;
      niveauOrdre: number;
      eleves: Array<{
        id: string;
        nom: string;
        prenom: string;
        matricule: string;
      }>;
    }
    const byClass = new Map<string, Bucket>();
    for (const r of rows) {
      const c = r.enrollment.class;
      let bucket = byClass.get(c.id);
      if (!bucket) {
        bucket = {
          classeId: c.id,
          classe: c.nom,
          section: c.level.cycle.section.nom,
          cycleOrdre: c.level.cycle.ordre,
          niveauOrdre: c.level.ordre,
          eleves: [],
        };
        byClass.set(c.id, bucket);
      }
      bucket.eleves.push(r.enrollment.student);
    }
    const classes = [...byClass.values()]
      .sort(
        (a, b) =>
          a.section.localeCompare(b.section, 'fr') ||
          a.cycleOrdre - b.cycleOrdre ||
          a.niveauOrdre - b.niveauOrdre ||
          a.classe.localeCompare(b.classe, 'fr'),
      )
      .map((c) => ({
        classeId: c.classeId,
        classe: c.classe,
        section: c.section,
        eleves: c.eleves.sort(
          (a, b) =>
            a.nom.localeCompare(b.nom, 'fr') ||
            a.prenom.localeCompare(b.prenom, 'fr'),
        ),
      }));

    return {
      date: day,
      actif: settings.actif,
      estJourCantine,
      ferme: closure ? closure.libelle : null,
      total: rows.length,
      classes,
    };
  }

  /** Ce que le parent voit : réglages, jours payés de l'année et ses achats, sans identifiant interne. */
  async forParent(studentId: string) {
    const school = await this.schoolService.getDefault();
    const settings = this.settingsOf(school);
    const ctx = await this.yearContext(school.id);
    const enrollment = await this.activeEnrollment(school.id, studentId);
    const today = dayInTimezone(new Date(), school.fuseauHoraire);
    if (!settings.actif || !enrollment || !ctx) {
      return {
        actif: settings.actif,
        prixJour: settings.prixJour,
        jours: settings.jours,
        joursPayes: [] as Array<{ date: string; ferme: boolean }>,
        prochain: null as string | null,
        achats: [] as Array<{
          libelle: string;
          montant: number;
          nombreJours: number;
          datePaiement: Date | null;
        }>,
      };
    }
    const paid = await this.prisma.canteenDay.findMany({
      where: { enrollmentId: enrollment.id },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    const joursPayes = paid.map((p) => {
      const d = isoDay(p.date);
      return { date: d, ferme: closureOn(d, ctx.closures) !== null };
    });
    const prochain = joursPayes.find((j) => j.date >= today && !j.ferme);
    const purchases = enrollment.invoice
      ? await this.purchasesOf(enrollment.invoice.id)
      : [];
    return {
      actif: true,
      prixJour: settings.prixJour,
      jours: settings.jours,
      joursPayes,
      prochain: prochain?.date ?? null,
      achats: purchases
        .filter((a) => !a.annulee)
        .map((a) => ({
          libelle: a.libelle,
          montant: a.montant,
          nombreJours: a.jours.length,
          datePaiement: a.paiement?.datePaiement ?? null,
        })),
    };
  }
}

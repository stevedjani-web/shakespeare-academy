import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';
import { AuditService } from '../audit/audit.service';
import { FeeTypesService } from '../fee-types/fee-types.service';
import { AddInvoiceLineDto } from './dto/add-invoice-line.dto';
import { computeApprovedDiscountAmount } from '../discounts/discount-amount.util';

interface TargetLine {
  feeTypeId: string;
  libelle: string;
  montant: number;
  dateEcheance: Date | null;
  delaiGraceJours: number;
  ordre: number;
}

export interface RealignedLine {
  ligneId: string;
  feeTypeId: string;
  ordre: number;
  libelle: string;
  ancienLibelle: string;
  ancienMontant: number;
  nouveauMontant: number;
  ancienneEcheance: Date | null;
  nouvelleEcheance: Date | null;
  /** La ligne a déjà reçu au moins un paiement valide. */
  payee: boolean;
}

export interface InvoiceRealignment {
  modifiees: RealignedLine[];
  ajoutees: { libelle: string; montant: number }[];
  inchangees: number;
  /** Lignes que le nouveau niveau ne remplace pas (ajoutées à la main, ou frais absent de sa grille) : gardées telles quelles. */
  nonConcernees: string[];
  totalAvant: number;
  totalApres: number;
  /** Un montant change ou une ligne apparaît : la facture ne vaut plus la même chose. */
  impactFinancier: boolean;
  /** Raisons pour lesquelles le changement est impossible (vide = possible). */
  blocages: string[];
}

const INVOICE_INCLUDE = {
  lines: {
    include: {
      feeType: true,
      discounts: true,
      payments: { where: { statut: 'VALIDE' as const } },
    },
    orderBy: { ordre: 'asc' as const },
  },
  enrollment: {
    select: {
      id: true,
      numero: true,
      student: {
        select: { id: true, nom: true, prenom: true, matricule: true },
      },
    },
  },
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schoolService: SchoolService,
    private readonly auditService: AuditService,
    private readonly feeTypesService: FeeTypesService,
  ) {}

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, schoolId },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable.');
    }
    return invoice;
  }

  async findByEnrollment(enrollmentId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const invoice = await this.prisma.invoice.findFirst({
      where: { enrollmentId, schoolId },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException('Aucune facture pour cette inscription.');
    }
    return invoice;
  }

  /**
   * Génère la facture d'une inscription à partir des grilles tarifaires applicables (obligatoires
   * uniquement — un frais facultatif n'est jamais facturé automatiquement, cadrage §5). Appelée à
   * l'intérieur de la même transaction que la création de l'Enrollment (CA02 : la création
   * d'inscription génère exactement les frais applicables, aucune inscription sans facture).
   *
   * D39 (DECISIONS_PENDING.md) : un `FeeType.appliesTo` restreint le frais à un seul type
   * d'inscription (ex. "Frais d'inscription" jamais facturé à une réinscription, et vice versa) —
   * `TOUS` (défaut) s'applique aux deux, comme l'écolage.
   */
  async generateForEnrollment(
    tx: Prisma.TransactionClient,
    params: {
      schoolId: string;
      enrollmentId: string;
      academicYearId: string;
      levelId: string;
      enrollmentType: EnrollmentType;
    },
  ) {
    const targets = await this.targetLines(tx, params);
    const lines: Prisma.InvoiceLineCreateWithoutInvoiceInput[] = targets.map(
      (t) => ({
        feeType: { connect: { id: t.feeTypeId } },
        libelle: t.libelle,
        montant: t.montant,
        dateEcheance: t.dateEcheance,
        delaiGraceJours: t.delaiGraceJours,
        ordre: t.ordre,
      }),
    );

    return tx.invoice.create({
      data: {
        schoolId: params.schoolId,
        enrollmentId: params.enrollmentId,
        lines: lines.length > 0 ? { create: lines } : undefined,
      },
      include: INVOICE_INCLUDE,
    });
  }

  /** Lignes que la grille tarifaire d'un niveau produit pour un type d'inscription (frais obligatoires seulement). */
  private async targetLines(
    tx: Prisma.TransactionClient,
    params: {
      schoolId: string;
      academicYearId: string;
      levelId: string;
      enrollmentType: EnrollmentType;
    },
  ): Promise<TargetLine[]> {
    const feeSchedules = await tx.feeSchedule.findMany({
      where: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        levelId: params.levelId,
        feeType: {
          obligatoire: true,
          appliesTo: { in: ['TOUS', params.enrollmentType] },
        },
      },
      include: { feeType: true, installments: { orderBy: { ordre: 'asc' } } },
    });

    const lines: TargetLine[] = [];
    for (const schedule of feeSchedules) {
      if (schedule.feeType.avecTranches) {
        for (const installment of schedule.installments) {
          lines.push({
            feeTypeId: schedule.feeTypeId,
            libelle: `${schedule.feeType.nom} — ${installment.libelle}`,
            montant: installment.montant,
            dateEcheance: installment.dateLimite,
            delaiGraceJours: installment.delaiGraceJours,
            ordre: installment.ordre,
          });
        }
      } else if (schedule.montant != null) {
        lines.push({
          feeTypeId: schedule.feeTypeId,
          libelle: schedule.feeType.nom,
          montant: schedule.montant,
          dateEcheance: null,
          delaiGraceJours: 0,
          ordre: 0,
        });
      }
    }
    return lines;
  }

  /**
   * Réaligne la facture d'une inscription sur les tarifs d'un autre niveau (correction d'une erreur de classe).
   * Une ligne se retrouve par son type de frais et son rang (la 2e tranche de pension reste la 2e tranche) ; son
   * libellé, son montant et son échéance prennent ceux du nouveau niveau. Les lignes ajoutées à la main (tenue,
   * cantine…) et celles que le nouveau niveau n'a pas ne sont jamais touchées. Une ligne dont le montant change est
   * refusée (409) si un paiement est en cours dessus ou si ce qui est déjà payé dépasserait le nouveau tarif (RG08).
   * `appliquer: false` ne fait que calculer ce qui se passerait.
   */
  async realignForLevelChange(
    tx: Prisma.TransactionClient,
    params: {
      schoolId: string;
      enrollmentId: string;
      academicYearId: string;
      levelId: string;
      enrollmentType: EnrollmentType;
      appliquer: boolean;
      actingUserId: string;
    },
  ): Promise<InvoiceRealignment> {
    const invoice = await tx.invoice.findUnique({
      where: { enrollmentId: params.enrollmentId },
      include: {
        lines: {
          include: {
            discounts: true,
            payments: { where: { statut: 'VALIDE' } },
            onlinePayments: {
              where: { statut: { in: ['EN_ATTENTE', 'A_TRAITER'] } },
            },
            bankClaimLines: {
              where: {
                claim: { statut: { in: ['EN_ATTENTE', 'CREDIT_CONFIRME'] } },
              },
            },
          },
          orderBy: { ordre: 'asc' },
        },
      },
    });
    if (!invoice || invoice.statut === 'ANNULEE') {
      throw new ConflictException(
        'La facture de cette inscription est annulée : rien à réaligner.',
      );
    }
    const targets = await this.targetLines(tx, params);
    const key = (feeTypeId: string, ordre: number) => `${feeTypeId}#${ordre}`;
    const byKey = new Map(targets.map((t) => [key(t.feeTypeId, t.ordre), t]));

    const modifiees: RealignedLine[] = [];
    const blocages: string[] = [];
    let inchangees = 0;
    const nonConcernees: string[] = [];
    const used = new Set<string>();

    for (const line of invoice.lines) {
      if (line.annuleeAt) continue;
      const target = byKey.get(key(line.feeTypeId, line.ordre));
      if (!target) {
        nonConcernees.push(line.libelle);
        continue;
      }
      used.add(key(line.feeTypeId, line.ordre));
      const sameDate =
        (line.dateEcheance?.getTime() ?? null) ===
        (target.dateEcheance?.getTime() ?? null);
      if (
        line.libelle === target.libelle &&
        line.montant === target.montant &&
        sameDate &&
        line.delaiGraceJours === target.delaiGraceJours
      ) {
        inchangees++;
        continue;
      }
      if (line.montant !== target.montant) {
        if (line.onlinePayments.length > 0 || line.bankClaimLines.length > 0) {
          blocages.push(
            `« ${line.libelle} » : un paiement est en cours (en ligne ou par banque). Attendez son traitement.`,
          );
        }
        const paye = line.payments.reduce((sum, p) => sum + p.montant, 0);
        const remise = computeApprovedDiscountAmount(
          { ...line, montant: target.montant },
          line.discounts,
        );
        if (target.montant - remise < paye) {
          blocages.push(
            `« ${line.libelle} » : ${paye} XAF sont déjà payés, plus que le nouveau tarif (${target.montant} XAF, remises déduites).`,
          );
        }
      }
      modifiees.push({
        ligneId: line.id,
        feeTypeId: line.feeTypeId,
        ordre: line.ordre,
        libelle: target.libelle,
        ancienLibelle: line.libelle,
        ancienMontant: line.montant,
        nouveauMontant: target.montant,
        ancienneEcheance: line.dateEcheance,
        nouvelleEcheance: target.dateEcheance,
        payee: line.payments.length > 0,
      });
    }
    const ajoutees = targets.filter(
      (t) => !used.has(key(t.feeTypeId, t.ordre)),
    );

    const totalAvant = invoice.lines.reduce(
      (sum, l) => (l.annuleeAt ? sum : sum + l.montant),
      0,
    );
    const totalApres =
      totalAvant +
      modifiees.reduce(
        (sum, l) => sum + l.nouveauMontant - l.ancienMontant,
        0,
      ) +
      ajoutees.reduce((sum, l) => sum + l.montant, 0);
    const impactFinancier =
      totalApres !== totalAvant ||
      modifiees.some((l) => l.ancienMontant !== l.nouveauMontant) ||
      ajoutees.length > 0;

    const result: InvoiceRealignment = {
      modifiees,
      ajoutees: ajoutees.map((t) => ({
        libelle: t.libelle,
        montant: t.montant,
      })),
      inchangees,
      nonConcernees,
      totalAvant,
      totalApres,
      impactFinancier,
      blocages,
    };

    if (params.appliquer) {
      if (blocages.length > 0) {
        throw new ConflictException(
          `Le changement de niveau est impossible : ${blocages.join(' ')}`,
        );
      }
      for (const m of modifiees) {
        const target = byKey.get(key(m.feeTypeId, m.ordre))!;
        await tx.invoiceLine.update({
          where: { id: m.ligneId },
          data: {
            libelle: target.libelle,
            montant: target.montant,
            dateEcheance: target.dateEcheance,
            delaiGraceJours: target.delaiGraceJours,
          },
        });
      }
      for (const t of ajoutees) {
        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            feeTypeId: t.feeTypeId,
            libelle: t.libelle,
            montant: t.montant,
            dateEcheance: t.dateEcheance,
            delaiGraceJours: t.delaiGraceJours,
            ordre: t.ordre,
          },
        });
      }
    }
    return result;
  }

  /** Une ligne d'audit par ligne de facture corrigée (à appeler une fois la transaction validée). */
  async auditRealignment(
    schoolId: string,
    userId: string,
    realignment: InvoiceRealignment,
    motif: string,
  ) {
    for (const m of realignment.modifiees) {
      await this.auditService.log({
        schoolId,
        userId,
        action: 'INVOICE_LINE_CORRECT',
        entite: 'InvoiceLine',
        entiteId: m.ligneId,
        ancienneValeur: {
          libelle: m.ancienLibelle,
          montant: m.ancienMontant,
          dateEcheance: m.ancienneEcheance,
        },
        nouvelleValeur: {
          libelle: m.libelle,
          montant: m.nouveauMontant,
          dateEcheance: m.nouvelleEcheance,
          motif,
        },
      });
    }
  }

  async cancelForEnrollment(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
  ) {
    const invoice = await tx.invoice.findUnique({ where: { enrollmentId } });
    if (!invoice || invoice.statut === 'ANNULEE') {
      return invoice;
    }
    return tx.invoice.update({
      where: { id: invoice.id },
      data: { statut: 'ANNULEE' },
    });
  }

  /**
   * Ajoute manuellement une ligne à une facture déjà émise — "autres frais/autres recettes"
   * (tenue, livres, cantine, etc., cahier §3/D05 : `fee_types` librement paramétrable, facturable
   * à tout moment via cet écran). Jamais pour un `FeeType.avecTranches` : les tranches passent
   * toujours par la grille tarifaire (`/fee-schedules`), pas par un ajout ponctuel.
   */
  async addManualLine(
    invoiceId: string,
    dto: AddInvoiceLineDto,
    actingUserId: string,
  ) {
    const invoice = await this.findOne(invoiceId);
    if (invoice.statut === 'ANNULEE') {
      throw new ConflictException(
        'Cette facture est annulée, aucune ligne ne peut y être ajoutée.',
      );
    }
    const feeType = await this.feeTypesService.findOne(dto.feeTypeId);
    if (feeType.avecTranches) {
      throw new BadRequestException(
        'Ce type de frais est réparti en tranches — utilisez la configuration tarifaire, pas un ajout ponctuel.',
      );
    }

    const ordreMax = invoice.lines.reduce(
      (max, l) => Math.max(max, l.ordre),
      0,
    );
    const line = await this.prisma.invoiceLine.create({
      data: {
        invoiceId,
        feeTypeId: dto.feeTypeId,
        libelle: feeType.nom,
        montant: dto.montant,
        dateEcheance: null,
        delaiGraceJours: 0,
        ordre: ordreMax + 1,
      },
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'INVOICE_LINE_CREATE',
      entite: 'InvoiceLine',
      entiteId: line.id,
      nouvelleValeur: line,
    });

    return this.findOne(invoiceId);
  }
}

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

    const lines: Prisma.InvoiceLineCreateWithoutInvoiceInput[] = [];
    for (const schedule of feeSchedules) {
      if (schedule.feeType.avecTranches) {
        for (const installment of schedule.installments) {
          lines.push({
            feeType: { connect: { id: schedule.feeTypeId } },
            libelle: `${schedule.feeType.nom} — ${installment.libelle}`,
            montant: installment.montant,
            dateEcheance: installment.dateLimite,
            delaiGraceJours: installment.delaiGraceJours,
            ordre: installment.ordre,
          });
        }
      } else if (schedule.montant != null) {
        lines.push({
          feeType: { connect: { id: schedule.feeTypeId } },
          libelle: schedule.feeType.nom,
          montant: schedule.montant,
          dateEcheance: null,
          delaiGraceJours: 0,
          ordre: 0,
        });
      }
    }

    return tx.invoice.create({
      data: {
        schoolId: params.schoolId,
        enrollmentId: params.enrollmentId,
        lines: lines.length > 0 ? { create: lines } : undefined,
      },
      include: INVOICE_INCLUDE,
    });
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

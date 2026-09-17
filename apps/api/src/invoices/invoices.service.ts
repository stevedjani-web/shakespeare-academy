import { Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';

const INVOICE_INCLUDE = {
  lines: {
    include: { feeType: true, discounts: true, payments: { where: { statut: 'VALIDE' as const } } },
    orderBy: { ordre: 'asc' as const },
  },
  enrollment: {
    select: {
      id: true,
      numero: true,
      student: { select: { id: true, nom: true, prenom: true, matricule: true } },
    },
  },
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schoolService: SchoolService,
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
        feeType: { obligatoire: true, appliesTo: { in: ['TOUS', params.enrollmentType] } },
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

  async cancelForEnrollment(tx: Prisma.TransactionClient, enrollmentId: string) {
    const invoice = await tx.invoice.findUnique({ where: { enrollmentId } });
    if (!invoice || invoice.statut === 'ANNULEE') {
      return invoice;
    }
    return tx.invoice.update({ where: { id: invoice.id }, data: { statut: 'ANNULEE' } });
  }
}

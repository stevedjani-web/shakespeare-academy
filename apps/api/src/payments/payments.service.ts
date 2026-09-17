import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Discount, InvoiceLine, Payment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { NumberSequenceService } from '../common/number-sequence.service';
import { computeApprovedDiscountAmount } from '../discounts/discount-amount.util';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CancelPaymentDto } from './dto/cancel-payment.dto';

const RECEIPT_NUMERO_DIGITS = 6;

const PAYMENT_INCLUDE = {
  invoiceLine: {
    include: {
      feeType: true,
      discounts: true,
      invoice: {
        include: {
          enrollment: {
            include: {
              student: { select: { id: true, nom: true, prenom: true, matricule: true } },
              class: { select: { id: true, nom: true } },
              academicYear: { select: { id: true, libelle: true } },
            },
          },
        },
      },
      payments: { where: { statut: 'VALIDE' as const } },
    },
  },
  recuParUser: { select: { id: true, nom: true, prenom: true } },
  annuleParUser: { select: { id: true, nom: true, prenom: true } },
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
    private readonly numberSequenceService: NumberSequenceService,
  ) {}

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const payment = await this.prisma.payment.findFirst({
      where: { id, schoolId },
      include: PAYMENT_INCLUDE,
    });
    if (!payment) {
      throw new NotFoundException('Paiement introuvable.');
    }
    return payment;
  }

  async findAllForStudent(studentId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.payment.findMany({
      where: { schoolId, invoiceLine: { invoice: { enrollment: { studentId } } } },
      include: PAYMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForInvoiceLine(invoiceLineId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.payment.findMany({
      where: { schoolId, invoiceLineId },
      include: PAYMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Solde restant d'une ligne : montant - remises approuvées - paiements VALIDE déjà encaissés. */
  private computeSoldeRestant(line: InvoiceLine & { discounts: Discount[]; payments: Payment[] }): number {
    const remise = computeApprovedDiscountAmount(line, line.discounts);
    const paye = line.payments.reduce((sum, p) => sum + p.montant, 0);
    return Math.max(0, line.montant - remise - paye);
  }

  /**
   * Encaisse un paiement contre UNE SEULE ligne de facture (D41, DECISIONS_PENDING.md) — jamais
   * réparti sur plusieurs lignes, le montant est toujours plafonné au solde restant de cette ligne
   * précise. Paiement partiel autorisé (D10) : plusieurs paiements successifs jusqu'à solde nul.
   */
  async create(dto: CreatePaymentDto, actingUserId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const line = await this.prisma.invoiceLine.findFirst({
      where: { id: dto.invoiceLineId, invoice: { schoolId } },
      include: { invoice: true, discounts: true, payments: { where: { statut: 'VALIDE' } } },
    });
    if (!line) {
      throw new NotFoundException('Ligne de facture introuvable.');
    }
    if (line.invoice.statut === 'ANNULEE') {
      throw new ConflictException('Cette facture est annulée, aucun paiement ne peut y être encaissé.');
    }

    const soldeRestant = this.computeSoldeRestant(line);
    if (soldeRestant <= 0) {
      throw new ConflictException('Cette ligne est déjà entièrement soldée.');
    }
    if (dto.montant > soldeRestant) {
      throw new BadRequestException(
        `Le montant dépasse le solde restant de cette ligne (${soldeRestant} XAF).`,
      );
    }

    const sequenceNumber = await this.numberSequenceService.next(schoolId, 'RECEIPT');
    const numeroRecu = `REC-${String(sequenceNumber).padStart(RECEIPT_NUMERO_DIGITS, '0')}`;

    const payment = await this.prisma.payment.create({
      data: {
        schoolId,
        invoiceLineId: dto.invoiceLineId,
        montant: dto.montant,
        modePaiement: dto.modePaiement ?? 'ESPECES',
        referenceExterne: dto.referenceExterne,
        numeroRecu,
        recuParUserId: actingUserId,
      },
      include: PAYMENT_INCLUDE,
    });

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'PAYMENT_CREATE',
      entite: 'Payment',
      entiteId: payment.id,
      nouvelleValeur: payment,
    });

    return payment;
  }

  async cancel(id: string, dto: CancelPaymentDto, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.statut !== 'VALIDE') {
      throw new ConflictException('Seul un paiement validé peut être annulé.');
    }

    const payment = await this.prisma.payment.update({
      where: { id },
      data: { statut: 'ANNULE', motifAnnulation: dto.motif, annuleParUserId: actingUserId },
      include: PAYMENT_INCLUDE,
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'PAYMENT_CANCEL',
      entite: 'Payment',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: payment,
    });

    return payment;
  }

  /** D30 (DECISIONS_PENDING.md) : chaque réimpression d'un reçu est journalisée (RG15). */
  async reprint(id: string, actingUserId: string) {
    const payment = await this.findOne(id);
    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'PAYMENT_REPRINT',
      entite: 'Payment',
      entiteId: id,
      nouvelleValeur: { numeroRecu: payment.numeroRecu },
    });
    return payment;
  }
}

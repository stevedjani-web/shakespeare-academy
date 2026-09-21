import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
// Fenêtre acceptée pour l'instant réel d'une saisie hors ligne : ni dans le futur (tolérance d'horloge),
// ni plus vieille que quelques semaines (une synchronisation qui traîne plus longtemps est suspecte).
const OFFLINE_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const OFFLINE_CLOCK_SKEW_MS = 10 * 60 * 1000;

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

  /**
   * D29 : vérification publique d'authenticité d'un reçu, via le jeton opaque (jamais le numéro
   * de reçu, séquentiel et donc devinable) imprimé en QR code. Ne renvoie que le strict nécessaire
   * pour confirmer qu'un reçu physique correspond à un vrai enregistrement — jamais de téléphone
   * de responsable ni d'autre donnée personnelle sensible.
   */
  async verifyByToken(token: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { verificationToken: token },
      include: PAYMENT_INCLUDE,
    });
    if (!payment) {
      throw new NotFoundException('Reçu introuvable ou jeton invalide.');
    }
    const schoolId = await this.schoolService.getDefaultId();
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    return {
      numeroRecu: payment.numeroRecu,
      montant: payment.montant,
      statut: payment.statut,
      datePaiement: payment.datePaiement,
      motif: payment.invoiceLine.feeType.nom,
      eleve: {
        nom: payment.invoiceLine.invoice.enrollment.student.nom,
        prenom: payment.invoiceLine.invoice.enrollment.student.prenom,
      },
      etablissement: school?.nom ?? null,
    };
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

    let saisieHorsLigneAt: Date | undefined;
    if (dto.dateSaisie && !dto.numeroProvisoire) {
      throw new BadRequestException("dateSaisie n'est acceptée qu'avec un numeroProvisoire (saisie hors ligne).");
    }
    if (dto.numeroProvisoire) {
      // Renvoi d'une saisie déjà synchronisée (réponse perdue, deuxième appareil...) : même reçu, jamais deux paiements.
      const already = await this.prisma.payment.findFirst({
        where: { schoolId, numeroProvisoire: dto.numeroProvisoire },
        include: PAYMENT_INCLUDE,
      });
      if (already) {
        if (already.invoiceLineId !== dto.invoiceLineId || already.montant !== dto.montant) {
          throw new ConflictException('Ce numéro de reçu provisoire correspond déjà à un autre encaissement.');
        }
        return already;
      }
      if (dto.dateSaisie) {
        saisieHorsLigneAt = new Date(dto.dateSaisie);
        const now = Date.now();
        if (saisieHorsLigneAt.getTime() > now + OFFLINE_CLOCK_SKEW_MS) {
          throw new BadRequestException('La date de saisie est dans le futur.');
        }
        if (saisieHorsLigneAt.getTime() < now - OFFLINE_MAX_AGE_MS) {
          throw new BadRequestException('La date de saisie est trop ancienne (plus de 45 jours).');
        }
      }
    }

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
        numeroProvisoire: dto.numeroProvisoire,
        saisieHorsLigneAt,
        ...(saisieHorsLigneAt ? { datePaiement: saisieHorsLigneAt } : {}),
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
    // RG09 : celui qui a encaissé un paiement ne valide jamais lui-même son annulation.
    if (before.recuParUserId === actingUserId) {
      throw new ForbiddenException(
        "Vous ne pouvez pas annuler un paiement que vous avez encaissé vous-même : un autre responsable doit l'approuver.",
      );
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

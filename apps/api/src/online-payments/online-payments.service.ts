import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  Discount,
  InvoiceLine,
  OnlinePaymentStatus,
  Payment,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { computeApprovedDiscountAmount } from '../discounts/discount-amount.util';
import {
  ONLINE_PAYMENT_PROVIDER,
  OnlinePaymentRefusedError,
  type OnlinePaymentProvider,
} from './online-payment-provider.interface';
import { normalizeMsisdn } from './msisdn.util';
import { GENERIC_FAILURE } from './pawapay-failures.util';
import {
  InitiateOnlinePaymentDto,
  ListOnlinePaymentsQueryDto,
  ResolveOnlinePaymentDto,
} from './dto/online-payments.dto';

const RECEIPT_NUMERO_DIGITS = 6;
// Une tentative en attente depuis plus longtemps que cela est revérifiée auprès du fournisseur : le retour
// signé a pu se perdre et l'application n'a pas de planificateur pour aller le chercher.
const STALE_AFTER_MS = 2 * 60 * 1000;
const LIST_LIMIT = 200;

export type ProviderResult =
  { statut: 'COMPLETED' } | { statut: 'FAILED'; motif?: string };

function soldeOf(
  line: InvoiceLine & { discounts: Discount[]; payments: Payment[] },
): number {
  const remise = computeApprovedDiscountAmount(line, line.discounts);
  const paye = line.payments.reduce((sum, p) => sum + p.montant, 0);
  return Math.max(0, line.montant - remise - paye);
}

/**
 * Paiement des frais par les parents (Mobile Money). Une tentative (`OnlinePayment`) est distincte du
 * paiement : le `Payment` et son reçu séquentiel (RG10) ne naissent qu'à la CONFIRMATION du fournisseur.
 * Une tentative échouée ou abandonnée ne consomme donc aucun numéro de reçu, et aucune requête financière
 * existante n'est touchée (toutes filtrent déjà `statut = VALIDE`). Aucune notification financière (D70).
 */
@Injectable()
export class OnlinePaymentsService {
  private readonly logger = new Logger(OnlinePaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schoolService: SchoolService,
    @Inject(ONLINE_PAYMENT_PROVIDER)
    private readonly provider: OnlinePaymentProvider,
  ) {}

  private async isAvailable(): Promise<boolean> {
    const school = await this.schoolService.getDefault();
    return school.paiementEnLigneActif && this.provider.isConfigured();
  }

  /** Ce que le portail affiche pour l'élève : l'interrupteur et les tranches encore à payer. */
  async overview(studentId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, statut: 'EMISE', enrollment: { studentId } },
      include: {
        lines: {
          include: {
            discounts: true,
            payments: { where: { statut: 'VALIDE' } },
            onlinePayments: {
              where: { statut: 'EN_ATTENTE' },
              select: { id: true, montant: true, createdAt: true },
            },
          },
        },
      },
    });
    const now = new Date();
    const tranches: Array<{
      trancheId: string;
      libelle: string;
      montant: number;
      solde: number;
      dateLimite: Date;
      enRetard: boolean;
      enAttente: { id: string; montant: number } | null;
    }> = [];
    for (const invoice of invoices) {
      for (const line of invoice.lines) {
        const solde = soldeOf(line);
        if (solde <= 0) continue;
        const base = new Date(line.dateEcheance ?? invoice.dateEmission);
        base.setDate(base.getDate() + line.delaiGraceJours);
        const pending = line.onlinePayments[0];
        tranches.push({
          trancheId: line.id,
          libelle: line.libelle,
          montant: line.montant,
          solde,
          dateLimite: base,
          enRetard: base < now,
          enAttente: pending
            ? { id: pending.id, montant: pending.montant }
            : null,
        });
      }
    }
    tranches.sort((a, b) => a.dateLimite.getTime() - b.dateLimite.getTime());
    return { paiementEnLigne: await this.isAvailable(), tranches };
  }

  /** Lance un paiement d'une tranche par le responsable `guardianId` (déjà rattaché à `studentId`). */
  async initiate(
    guardianId: string,
    studentId: string,
    dto: InitiateOnlinePaymentDto,
  ) {
    const school = await this.schoolService.getDefault();
    if (!school.paiementEnLigneActif || !this.provider.isConfigured()) {
      throw new ConflictException(
        "Le paiement en ligne n'est pas disponible pour le moment.",
      );
    }
    const telephone = normalizeMsisdn(dto.telephone);
    if (!telephone) {
      throw new BadRequestException(
        'Numéro invalide. Saisissez un numéro Mobile Money à 9 chiffres (par exemple 06 123 45 67).',
      );
    }

    const loadLine = () =>
      this.prisma.invoiceLine.findFirst({
        where: {
          id: dto.trancheId,
          invoice: {
            schoolId: school.id,
            statut: 'EMISE',
            enrollment: { studentId },
          },
        },
        include: { discounts: true, payments: { where: { statut: 'VALIDE' } } },
      });
    if (!(await loadLine()))
      throw new NotFoundException('Tranche introuvable.');

    // Une tentative oubliée (le parent n'a jamais validé sur son téléphone) ne doit pas bloquer la tranche.
    await this.refreshStale(dto.trancheId);

    const pending = await this.prisma.onlinePayment.findFirst({
      where: { invoiceLineId: dto.trancheId, statut: 'EN_ATTENTE' },
    });
    if (pending) {
      throw new ConflictException(
        'Un paiement est déjà en attente pour cette tranche. Validez-le sur votre téléphone ou patientez quelques minutes.',
      );
    }

    // Solde relu APRÈS la revérification : elle a pu confirmer un paiement.
    const line = await loadLine();
    if (!line) throw new NotFoundException('Tranche introuvable.');
    const solde = soldeOf(line);
    if (solde <= 0)
      throw new ConflictException('Cette tranche est déjà entièrement soldée.');
    if (dto.montant > solde) {
      throw new BadRequestException(
        `Le montant dépasse le solde restant de cette tranche (${solde} ${school.devise}).`,
      );
    }

    const attempt = await this.prisma.onlinePayment.create({
      data: {
        schoolId: school.id,
        invoiceLineId: line.id,
        guardianId,
        montant: dto.montant,
        telephone,
        depositId: randomUUID(),
      },
    });

    try {
      await this.provider.initiate({
        depositId: attempt.depositId,
        montant: attempt.montant,
        devise: school.devise,
        telephone,
      });
    } catch (err) {
      const motif =
        err instanceof OnlinePaymentRefusedError
          ? err.message
          : GENERIC_FAILURE;
      if (!(err instanceof OnlinePaymentRefusedError)) {
        this.logger.error(
          `Initiation du paiement ${attempt.id} en échec : ${(err as Error).message}`,
        );
      }
      await this.prisma.onlinePayment.updateMany({
        where: { id: attempt.id, statut: 'EN_ATTENTE' },
        data: { statut: 'ECHOUE', motifEchec: motif },
      });
      throw new UnprocessableEntityException(motif);
    }

    await this.audit.log({
      schoolId: school.id,
      userId: null,
      action: 'PAYMENT_ONLINE_INITIATE',
      entite: 'OnlinePayment',
      entiteId: attempt.id,
      nouvelleValeur: {
        invoiceLineId: line.id,
        montant: attempt.montant,
        guardianId,
      },
    });
    return { id: attempt.id, statut: attempt.statut, montant: attempt.montant };
  }

  /**
   * Applique le résultat donné par le fournisseur (retour signé ou revérification). Idempotent : un retour
   * rejoué ne fait rien. Renvoie l'état final, ou null si l'identifiant est inconnu.
   */
  async applyResult(
    depositId: string,
    result: ProviderResult,
  ): Promise<OnlinePaymentStatus | null> {
    const attempt = await this.prisma.onlinePayment.findUnique({
      where: { depositId },
    });
    if (!attempt) return null;

    if (result.statut === 'FAILED') {
      await this.prisma.onlinePayment.updateMany({
        where: { id: attempt.id, statut: 'EN_ATTENTE' },
        data: { statut: 'ECHOUE', motifEchec: result.motif ?? GENERIC_FAILURE },
      });
      return (
        await this.prisma.onlinePayment.findUniqueOrThrow({
          where: { id: attempt.id },
        })
      ).statut;
    }

    // COMPLETED : l'argent a été pris. Une tentative marquée ECHOUE par une réponse d'initiation ambiguë est
    // aussi acceptée : le fournisseur fait foi.
    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.onlinePayment.updateMany({
        where: { id: attempt.id, statut: { in: ['EN_ATTENTE', 'ECHOUE'] } },
        data: { statut: 'CONFIRME', motifEchec: null },
      });
      if (claimed.count === 0) return { kind: 'deja' as const };

      const line = await tx.invoiceLine.findUniqueOrThrow({
        where: { id: attempt.invoiceLineId },
        include: {
          invoice: true,
          discounts: true,
          payments: { where: { statut: 'VALIDE' } },
        },
      });
      const solde = line.invoice.statut === 'ANNULEE' ? 0 : soldeOf(line);
      if (attempt.montant > solde) {
        // Le solde a disparu entre-temps (encaissement au guichet, facture annulée) : argent pris mais non
        // imputé. Aucun reçu n'est créé ; le secrétariat le voit, la Direction le clôture avec un motif.
        await tx.onlinePayment.update({
          where: { id: attempt.id },
          data: { statut: 'A_TRAITER' },
        });
        return { kind: 'a_traiter' as const };
      }

      // Numéro de reçu attribué DANS la transaction : si elle échoue, aucun numéro n'est consommé (RG10).
      const sequence = await tx.numberSequence.upsert({
        where: {
          schoolId_type_scope: {
            schoolId: attempt.schoolId,
            type: 'RECEIPT',
            scope: '',
          },
        },
        create: {
          schoolId: attempt.schoolId,
          type: 'RECEIPT',
          scope: '',
          dernierNumero: 1,
        },
        update: { dernierNumero: { increment: 1 } },
      });
      const payment = await tx.payment.create({
        data: {
          schoolId: attempt.schoolId,
          invoiceLineId: attempt.invoiceLineId,
          montant: attempt.montant,
          modePaiement: 'MOBILE_MONEY',
          referenceExterne: attempt.depositId,
          numeroRecu: `REC-${String(sequence.dernierNumero).padStart(RECEIPT_NUMERO_DIGITS, '0')}`,
          recuParUserId: null,
        },
      });
      await tx.onlinePayment.update({
        where: { id: attempt.id },
        data: { paymentId: payment.id },
      });
      return {
        kind: 'confirme' as const,
        paymentId: payment.id,
        numeroRecu: payment.numeroRecu,
      };
    });

    if (outcome.kind === 'confirme') {
      await this.audit.log({
        schoolId: attempt.schoolId,
        userId: null,
        action: 'PAYMENT_ONLINE_CONFIRM',
        entite: 'Payment',
        entiteId: outcome.paymentId,
        nouvelleValeur: {
          onlinePaymentId: attempt.id,
          numeroRecu: outcome.numeroRecu,
          montant: attempt.montant,
        },
      });
    } else if (outcome.kind === 'a_traiter') {
      this.logger.warn(
        `Paiement en ligne ${attempt.id} reçu sans solde à imputer : à traiter par le secrétariat.`,
      );
      await this.audit.log({
        schoolId: attempt.schoolId,
        userId: null,
        action: 'PAYMENT_ONLINE_UNMATCHED',
        entite: 'OnlinePayment',
        entiteId: attempt.id,
        nouvelleValeur: { montant: attempt.montant },
      });
    }
    return (
      await this.prisma.onlinePayment.findUniqueOrThrow({
        where: { id: attempt.id },
      })
    ).statut;
  }

  /** Revérifie auprès du fournisseur les tentatives en attente depuis trop longtemps. Jamais bloquant. */
  private async refreshStale(invoiceLineId: string): Promise<void> {
    const stale = await this.prisma.onlinePayment.findMany({
      where: {
        invoiceLineId,
        statut: 'EN_ATTENTE',
        createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
      },
    });
    for (const attempt of stale) await this.recheck(attempt.depositId);
  }

  private async recheck(depositId: string): Promise<void> {
    try {
      const status = await this.provider.getStatus(depositId);
      if (status.statut === 'COMPLETED')
        await this.applyResult(depositId, { statut: 'COMPLETED' });
      else if (status.statut === 'FAILED')
        await this.applyResult(depositId, {
          statut: 'FAILED',
          motif: status.motif,
        });
    } catch (err) {
      this.logger.warn(
        `Revérification du dépôt ${depositId} impossible : ${(err as Error).message}`,
      );
    }
  }

  /** État d'une tentative pour le parent qui l'a lancée (sondé par l'écran). 404 pour tout autre. */
  async getForGuardian(guardianId: string, id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    let attempt = await this.prisma.onlinePayment.findFirst({
      where: { id, guardianId, schoolId },
    });
    if (!attempt) throw new NotFoundException('Paiement introuvable.');
    if (
      attempt.statut === 'EN_ATTENTE' &&
      attempt.createdAt.getTime() < Date.now() - STALE_AFTER_MS
    ) {
      await this.recheck(attempt.depositId);
      attempt = await this.prisma.onlinePayment.findUniqueOrThrow({
        where: { id },
      });
    }
    const payment = attempt.paymentId
      ? await this.prisma.payment.findUnique({
          where: { id: attempt.paymentId },
          select: { id: true, numeroRecu: true },
        })
      : null;
    return {
      id: attempt.id,
      statut: attempt.statut,
      montant: attempt.montant,
      motifEchec: attempt.motifEchec,
      paiement: payment,
    };
  }

  /** Reçu d'un paiement de l'enfant, lisible par le parent (le rattachement est déjà contrôlé par l'appelant). */
  async receiptForStudent(studentId: string, paymentId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        schoolId,
        invoiceLine: { invoice: { enrollment: { studentId } } },
      },
      include: {
        invoiceLine: {
          select: {
            libelle: true,
            invoice: {
              select: {
                enrollment: {
                  select: {
                    student: {
                      select: { nom: true, prenom: true, matricule: true },
                    },
                    class: { select: { nom: true } },
                    academicYear: { select: { libelle: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Reçu introuvable.');
    const school = await this.schoolService.getDefault();
    const e = payment.invoiceLine.invoice.enrollment;
    return {
      numeroRecu: payment.numeroRecu,
      statut: payment.statut,
      montant: payment.montant,
      devise: school.devise,
      modePaiement: payment.modePaiement,
      referenceExterne: payment.referenceExterne,
      date: payment.datePaiement,
      libelle: payment.invoiceLine.libelle,
      eleve: {
        nom: e.student.nom,
        prenom: e.student.prenom,
        matricule: e.student.matricule,
      },
      classe: e.class.nom,
      anneeScolaire: e.academicYear.libelle,
      ecole: {
        nom: school.nom,
        adresse: school.adresse,
        telephone: school.telephone,
        logoUrl: school.logoUrl,
      },
    };
  }

  // ---------------------------------------------------------------- personnel

  async list(query: ListOnlinePaymentsQueryDto) {
    const schoolId = await this.schoolService.getDefaultId();
    const rows = await this.prisma.onlinePayment.findMany({
      where: { schoolId, ...(query.statut ? { statut: query.statut } : {}) },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      include: {
        guardian: { select: { nom: true, prenom: true, telephone: true } },
        payment: { select: { id: true, numeroRecu: true } },
        invoiceLine: {
          select: {
            libelle: true,
            invoice: {
              select: {
                enrollment: {
                  select: {
                    student: {
                      select: {
                        id: true,
                        nom: true,
                        prenom: true,
                        matricule: true,
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
    return rows.map((r) => ({
      id: r.id,
      statut: r.statut,
      montant: r.montant,
      telephone: r.telephone,
      motifEchec: r.motifEchec,
      motifCloture: r.motifCloture,
      cloture: r.statut === 'A_TRAITER' && r.motifCloture !== null,
      createdAt: r.createdAt,
      tranche: r.invoiceLine.libelle,
      eleve: r.invoiceLine.invoice.enrollment.student,
      responsable: r.guardian,
      paiement: r.payment,
    }));
  }

  /** Bouton « Vérifier » : interroge le fournisseur pour une tentative en attente. */
  async reconcile(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const attempt = await this.prisma.onlinePayment.findFirst({
      where: { id, schoolId },
    });
    if (!attempt) throw new NotFoundException('Paiement en ligne introuvable.');
    if (attempt.statut === 'EN_ATTENTE') {
      let status: Awaited<ReturnType<OnlinePaymentProvider['getStatus']>>;
      try {
        status = await this.provider.getStatus(attempt.depositId);
      } catch (err) {
        this.logger.warn(
          `Vérification du paiement ${id} impossible : ${(err as Error).message}`,
        );
        throw new ServiceUnavailableException(
          'Le service de paiement ne répond pas. Réessayez dans quelques minutes.',
        );
      }
      if (status.statut === 'COMPLETED')
        await this.applyResult(attempt.depositId, { statut: 'COMPLETED' });
      else if (status.statut === 'FAILED') {
        await this.applyResult(attempt.depositId, {
          statut: 'FAILED',
          motif: status.motif,
        });
      }
    }
    const fresh = await this.prisma.onlinePayment.findUniqueOrThrow({
      where: { id },
    });
    return { id: fresh.id, statut: fresh.statut, motifEchec: fresh.motifEchec };
  }

  /** Clôture d'un paiement reçu sans solde à imputer, après remboursement fait hors de l'application. */
  async resolve(
    id: string,
    dto: ResolveOnlinePaymentDto,
    actingUserId: string,
  ) {
    const schoolId = await this.schoolService.getDefaultId();
    const attempt = await this.prisma.onlinePayment.findFirst({
      where: { id, schoolId },
    });
    if (!attempt) throw new NotFoundException('Paiement en ligne introuvable.');
    if (attempt.statut !== 'A_TRAITER' || attempt.motifCloture !== null) {
      throw new ConflictException(
        "Seul un paiement reçu sans solde à imputer, non encore clôturé, peut l'être.",
      );
    }
    const updated = await this.prisma.onlinePayment.update({
      where: { id },
      data: { motifCloture: dto.motif, clotureParUserId: actingUserId },
    });
    await this.audit.log({
      schoolId,
      userId: actingUserId,
      action: 'PAYMENT_ONLINE_RESOLVE',
      entite: 'OnlinePayment',
      entiteId: id,
      nouvelleValeur: { motif: dto.motif, montant: attempt.montant },
    });
    return {
      id: updated.id,
      statut: updated.statut,
      motifCloture: updated.motifCloture,
    };
  }
}

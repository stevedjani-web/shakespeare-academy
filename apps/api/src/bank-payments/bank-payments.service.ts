import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BankPaymentStatus,
  Discount,
  InvoiceLine,
  Payment,
  Prisma,
} from '@prisma/client';
import { existsSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { pick } from '../common/language';
import { computeApprovedDiscountAmount } from '../discounts/discount-amount.util';
import { checkExpenseFile, type IncomingFile } from '../expenses/expense-files';
import {
  bankProofPath,
  isStoredBankProofName,
  MAX_BANK_PROOFS,
  proofHash,
  removeBankProof,
  storeBankProof,
} from './bank-payment-files';
import type {
  ConfirmBankPaymentDto,
  DeclareBankPaymentDto,
  RejectBankPaymentDto,
  ResolveSurplusDto,
  StaffDeclareBankPaymentDto,
  ValidateBankPaymentDto,
} from './dto/bank-payments.dto';

const RECEIPT_NUMERO_DIGITS = 6;
/** Au plus cinq déclarations en attente par responsable : une preuve mal comprise ne doit pas devenir un flot. */
const MAX_PENDING_PER_GUARDIAN = 5;
/** Une déclaration encore ouverte réserve une part de la tranche : on ne la déclare pas deux fois. */
const OPEN: BankPaymentStatus[] = ['EN_ATTENTE', 'CREDIT_CONFIRME'];
/** Une opération (banque + référence) ou une preuve (empreinte) ne sert qu'à une déclaration non refusée. */
const LIVE: BankPaymentStatus[] = ['EN_ATTENTE', 'CREDIT_CONFIRME', 'VALIDE'];
const STATUTS: readonly BankPaymentStatus[] = [
  'EN_ATTENTE',
  'CREDIT_CONFIRME',
  'VALIDE',
  'REJETE',
  'RETIRE',
];

const USER = { select: { id: true, nom: true, prenom: true } };

const CLAIM_INCLUDE = {
  declaredByUser: USER,
  guardian: {
    select: { id: true, nom: true, prenom: true, telephone: true },
  },
  confirmePar: USER,
  validePar: USER,
  compte: { select: { id: true, banque: true, titulaire: true } },
  proofs: {
    select: {
      id: true,
      nomAffiche: true,
      mimeType: true,
      taille: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  lines: {
    orderBy: { id: 'asc' as const },
    include: {
      payment: { select: { id: true, numeroRecu: true, statut: true } },
      invoiceLine: {
        include: {
          discounts: true,
          payments: { where: { statut: 'VALIDE' as const } },
          invoice: {
            select: {
              statut: true,
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
                  class: { select: { nom: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.BankPaymentClaimInclude;

type ClaimRow = Prisma.BankPaymentClaimGetPayload<{
  include: typeof CLAIM_INCLUDE;
}>;

function soldeOf(
  line: InvoiceLine & { discounts: Discount[]; payments: Payment[] },
): number {
  const remise = computeApprovedDiscountAmount(line, line.discounts);
  const paye = line.payments.reduce((sum, p) => sum + p.montant, 0);
  return Math.max(0, line.montant - remise - paye);
}

/** Clé d'une opération : banque et référence, casse, espaces et accents ignorés. */
export function operationKey(banque: string, reference: string): string {
  const clean = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toLowerCase();
  return `${clean(banque)}|${clean(reference)}`;
}

function parseDay(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function fullName(
  u: { nom: string | null; prenom: string | null } | null | undefined,
) {
  return u ? `${u.prenom ?? ''} ${u.nom ?? ''}`.trim() || null : null;
}

@Injectable()
export class BankPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  // ------------------------------------------------------------------ contexte (tranches payables)

  /**
   * Les tranches encore à payer des élèves donnés, avec ce qui est déjà couvert par une déclaration en cours : sert à
   * remplir le formulaire (parent ou secrétariat) sans jamais proposer plus que le solde.
   */
  async studentsContext(schoolId: string, studentIds: string[]) {
    if (studentIds.length === 0) return [];
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      select: { id: true, nom: true, prenom: true, matricule: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        annuleeAt: null,
        invoice: {
          schoolId,
          statut: 'EMISE',
          enrollment: { studentId: { in: studentIds } },
        },
      },
      include: {
        discounts: true,
        payments: { where: { statut: 'VALIDE' } },
        invoice: {
          select: {
            dateEmission: true,
            enrollment: {
              select: { studentId: true, class: { select: { nom: true } } },
            },
          },
        },
        bankClaimLines: {
          where: { claim: { statut: { in: OPEN } } },
          select: { montantDeclare: true },
        },
      },
      orderBy: [{ ordre: 'asc' }, { dateEcheance: 'asc' }],
    });
    const now = new Date();
    return students.map((student) => {
      const tranches = lines
        .filter((l) => l.invoice.enrollment.studentId === student.id)
        .flatMap((l) => {
          const solde = soldeOf(l);
          if (solde <= 0) return [];
          const enCours = l.bankClaimLines.reduce(
            (sum, c) => sum + c.montantDeclare,
            0,
          );
          const limite = new Date(l.dateEcheance ?? l.invoice.dateEmission);
          limite.setDate(limite.getDate() + l.delaiGraceJours);
          return [
            {
              trancheId: l.id,
              libelle: l.libelle,
              solde,
              enCours,
              disponible: Math.max(0, solde - enCours),
              dateLimite: limite,
              enRetard: limite < now,
              classe: l.invoice.enrollment.class.nom,
            },
          ];
        })
        .sort((a, b) => a.dateLimite.getTime() - b.dateLimite.getTime());
      return { ...student, tranches };
    });
  }

  /** Contexte du parent : ses enfants (accès au portail non retiré) et les comptes bancaires de l'école. */
  async portalContext(guardianId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId, accesPortail: true },
      select: { studentId: true },
    });
    const [enfants, comptes] = await Promise.all([
      this.studentsContext(
        schoolId,
        links.map((l) => l.studentId),
      ),
      this.activeAccounts(schoolId),
    ]);
    return {
      actif: comptes.length > 0,
      comptes,
      enfants,
      maxEnAttente: MAX_PENDING_PER_GUARDIAN,
    };
  }

  /** Comptes proposés : jamais d'identifiant interne autre que celui qu'il faut renvoyer à la déclaration. */
  private activeAccounts(schoolId: string) {
    return this.prisma.schoolBankAccount.findMany({
      where: { schoolId, actif: true },
      select: {
        id: true,
        banque: true,
        titulaire: true,
        numero: true,
        instructions: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async staffStudentContext(studentId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const [student] = await this.studentsContext(schoolId, [studentId]);
    if (!student) {
      throw new NotFoundException(
        pick({ fr: 'Élève introuvable.', en: 'Student not found.' }),
      );
    }
    return student;
  }

  async staffAccounts() {
    return this.activeAccounts(await this.schoolService.getDefaultId());
  }

  // ------------------------------------------------------------------ déclaration

  declareForParent(
    guardianId: string,
    dto: DeclareBankPaymentDto,
    files: IncomingFile[],
  ) {
    return this.createClaim({
      dto,
      files,
      guardianId,
      declaredByUserId: null,
      portal: true,
    });
  }

  declareForStaff(
    userId: string,
    dto: StaffDeclareBankPaymentDto,
    files: IncomingFile[],
  ) {
    return this.createClaim({
      dto,
      files,
      guardianId: dto.guardianId ?? null,
      declaredByUserId: userId,
      portal: false,
    });
  }

  private async createClaim(opts: {
    dto: DeclareBankPaymentDto;
    files: IncomingFile[];
    guardianId: string | null;
    declaredByUserId: string | null;
    portal: boolean;
  }) {
    const { dto, guardianId, declaredByUserId, portal } = opts;
    if (opts.files.length === 0) {
      throw new BadRequestException(
        pick({
          fr: 'Joignez la preuve du paiement (reçu de la banque ou photo du chèque).',
          en: "Attach the proof of payment (the bank's receipt or a photo of the cheque).",
        }),
      );
    }
    if (opts.files.length > MAX_BANK_PROOFS) {
      throw new BadRequestException(
        pick({
          fr: `Trois pièces au plus par déclaration.`,
          en: 'At most three files per declaration.',
        }),
      );
    }
    const checked = opts.files.map((f) => checkExpenseFile(f));
    const hashes = checked.map((f) => proofHash(f.buffer));
    if (new Set(hashes).size !== hashes.length) {
      throw new BadRequestException(
        pick({
          fr: 'Le même fichier est joint deux fois.',
          en: 'The same file is attached twice.',
        }),
      );
    }

    const date = parseDay(dto.dateOperation);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        pick({
          fr: "La date de l'opération est invalide.",
          en: 'The operation date is invalid.',
        }),
      );
    }
    // Tolérance d'un jour : l'heure locale de l'établissement précède l'heure UTC.
    if (date.getTime() > Date.now() + 36 * 60 * 60 * 1000) {
      throw new BadRequestException(
        pick({
          fr: "La date de l'opération ne peut pas être dans le futur.",
          en: 'The operation date cannot be in the future.',
        }),
      );
    }
    if (date.getTime() < Date.now() - 400 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        pick({
          fr: "La date de l'opération est trop ancienne : contactez le secrétariat.",
          en: 'The operation date is too old: contact the school office.',
        }),
      );
    }

    const ids = dto.lignes.map((l) => l.trancheId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        pick({
          fr: 'Une même tranche ne peut figurer qu’une fois.',
          en: 'An instalment can only appear once.',
        }),
      );
    }
    const sum = dto.lignes.reduce((s, l) => s + l.montant, 0);
    if (sum !== dto.montant) {
      throw new BadRequestException(
        pick({
          fr: `La somme des tranches (${sum} XAF) doit être égale au montant payé (${dto.montant} XAF).`,
          en: `The instalments add up to ${sum} XAF, which must equal the amount paid (${dto.montant} XAF).`,
        }),
      );
    }

    const schoolId = await this.schoolService.getDefaultId();

    if (guardianId) {
      const guardian = await this.prisma.guardian.findFirst({
        where: { id: guardianId, schoolId },
        select: { id: true },
      });
      if (!guardian) {
        throw new NotFoundException(
          pick({ fr: 'Responsable introuvable.', en: 'Guardian not found.' }),
        );
      }
    }

    // Compte de l'école : doit exister et être actif ; exigé pour un virement ou un dépôt dès que l'école en propose.
    const accounts = await this.activeAccounts(schoolId);
    if (dto.compteId) {
      if (!accounts.some((a) => a.id === dto.compteId)) {
        throw new BadRequestException(
          pick({
            fr: "Ce compte bancaire de l'école n'existe pas ou n'est plus proposé.",
            en: 'This school bank account does not exist or is no longer offered.',
          }),
        );
      }
    } else if (dto.methode !== 'CHEQUE' && accounts.length > 0) {
      throw new BadRequestException(
        pick({
          fr: "Choisissez le compte de l'école qui a reçu l'argent.",
          en: 'Choose the school account that received the money.',
        }),
      );
    }

    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        id: { in: ids },
        annuleeAt: null,
        invoice: { schoolId, statut: 'EMISE' },
      },
      include: {
        discounts: true,
        payments: { where: { statut: 'VALIDE' } },
        invoice: {
          select: { enrollment: { select: { studentId: true } } },
        },
        bankClaimLines: {
          where: { claim: { statut: { in: OPEN } } },
          select: { montantDeclare: true },
        },
      },
    });
    if (lines.length !== ids.length) {
      throw new NotFoundException(
        pick({ fr: 'Tranche introuvable.', en: 'Instalment not found.' }),
      );
    }
    if (portal && guardianId) {
      // Un parent ne déclare que pour SES enfants (accès au portail non retiré) : jamais pour une autre famille.
      const allowed = await this.prisma.studentGuardian.findMany({
        where: {
          guardianId,
          accesPortail: true,
          studentId: {
            in: lines.map((l) => l.invoice.enrollment.studentId),
          },
        },
        select: { studentId: true },
      });
      const allowedIds = new Set(allowed.map((a) => a.studentId));
      if (!lines.every((l) => allowedIds.has(l.invoice.enrollment.studentId))) {
        throw new NotFoundException(
          pick({ fr: 'Tranche introuvable.', en: 'Instalment not found.' }),
        );
      }
    }
    for (const requested of dto.lignes) {
      const line = lines.find((l) => l.id === requested.trancheId)!;
      const solde = soldeOf(line);
      const enCours = line.bankClaimLines.reduce(
        (s, c) => s + c.montantDeclare,
        0,
      );
      const disponible = solde - enCours;
      if (disponible <= 0) {
        throw new ConflictException(
          pick({
            fr: `« ${line.libelle} » est déjà soldée ou déjà couverte par une déclaration en cours.`,
            en: `"${line.libelle}" is already paid or already covered by a declaration in progress.`,
          }),
        );
      }
      if (requested.montant > disponible) {
        throw new BadRequestException(
          pick({
            fr: `Le montant de « ${line.libelle} » dépasse ce qui reste à payer (${disponible} XAF).`,
            en: `The amount for "${line.libelle}" exceeds what is left to pay (${disponible} XAF).`,
          }),
        );
      }
    }

    const key = operationKey(dto.banque, dto.referenceOperation);
    const stored: string[] = [];
    try {
      for (const file of checked) stored.push(await storeBankProof(file));
      const claim = await this.prisma.$transaction(async (tx) => {
        // Deux déclarations simultanées de la même opération, ou du même parent : l'une après l'autre.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'bank-claim:' + schoolId}))`;

        if (portal && guardianId) {
          const pending = await tx.bankPaymentClaim.count({
            where: { schoolId, guardianId, statut: 'EN_ATTENTE' },
          });
          if (pending >= MAX_PENDING_PER_GUARDIAN) {
            throw new ConflictException(
              pick({
                fr: `Vous avez déjà ${pending} déclarations en attente de traitement : patientez avant d'en envoyer une autre.`,
                en: `You already have ${pending} declarations waiting to be processed: please wait before sending another.`,
              }),
            );
          }
        }
        const sameOperation = await tx.bankPaymentClaim.findFirst({
          where: { schoolId, referenceKey: key, statut: { in: LIVE } },
          select: { id: true },
        });
        if (sameOperation) {
          throw new ConflictException(
            pick({
              fr: 'Cette opération a déjà été déclarée (même banque, même référence).',
              en: 'This operation has already been declared (same bank, same reference).',
            }),
          );
        }
        const sameProof = await tx.bankPaymentProof.findFirst({
          where: {
            hash: { in: hashes },
            claim: { schoolId, statut: { in: LIVE } },
          },
          select: { id: true },
        });
        if (sameProof) {
          throw new ConflictException(
            pick({
              fr: 'Cette preuve a déjà servi pour une autre déclaration.',
              en: 'This proof has already been used for another declaration.',
            }),
          );
        }

        return tx.bankPaymentClaim.create({
          data: {
            schoolId,
            guardianId,
            declaredByUserId,
            methode: dto.methode,
            montant: dto.montant,
            banque: dto.banque.trim(),
            compteId: dto.compteId ?? null,
            referenceOperation: dto.referenceOperation.trim(),
            referenceKey: key,
            dateOperation: date,
            payeur: dto.payeur?.trim() || null,
            note: dto.note?.trim() || null,
            lines: {
              create: dto.lignes.map((l) => ({
                invoiceLineId: l.trancheId,
                montantDeclare: l.montant,
              })),
            },
            proofs: {
              create: checked.map((file, i) => ({
                fichier: stored[i],
                nomAffiche: file.nomAffiche,
                mimeType: file.detected.type,
                taille: file.buffer.length,
                hash: hashes[i],
              })),
            },
          },
          include: CLAIM_INCLUDE,
        });
      });
      await this.audit.log({
        schoolId,
        userId: declaredByUserId,
        action: 'BANK_PAYMENT_DECLARE',
        entite: 'BankPaymentClaim',
        entiteId: claim.id,
        nouvelleValeur: {
          methode: claim.methode,
          montant: claim.montant,
          tranches: claim.lines.length,
          pieces: claim.proofs.length,
          guardianId,
          parLeParent: portal,
        },
      });
      return portal ? this.toPortalView(claim) : this.toStaffView(claim);
    } catch (error) {
      await Promise.all(stored.map((name) => removeBankProof(name)));
      throw error;
    }
  }

  // ------------------------------------------------------------------ lecture

  async summary() {
    const schoolId = await this.schoolService.getDefaultId();
    const [groups, surplus] = await Promise.all([
      this.prisma.bankPaymentClaim.groupBy({
        by: ['statut'],
        where: { schoolId },
        _count: true,
        _sum: { montant: true },
      }),
      this.prisma.bankPaymentClaim.aggregate({
        where: {
          schoolId,
          statut: 'VALIDE',
          excedent: { gt: 0 },
          excedentRegleLe: null,
        },
        _count: true,
        _sum: { excedent: true },
      }),
    ]);
    const of = (statut: BankPaymentStatus) => {
      const g = groups.find((x) => x.statut === statut);
      return { count: g?._count ?? 0, total: g?._sum.montant ?? 0 };
    };
    return {
      aConfirmer: of('EN_ATTENTE'),
      aValider: of('CREDIT_CONFIRME'),
      valides: of('VALIDE'),
      refuses: {
        count: of('REJETE').count + of('RETIRE').count,
        total: of('REJETE').total + of('RETIRE').total,
      },
      excedentsAregler: {
        count: surplus._count,
        total: surplus._sum.excedent ?? 0,
      },
    };
  }

  async findAll(statut?: string) {
    const schoolId = await this.schoolService.getDefaultId();
    let where: Prisma.BankPaymentClaimWhereInput = { schoolId };
    if (statut === 'EXCEDENT') {
      where = {
        schoolId,
        statut: 'VALIDE',
        excedent: { gt: 0 },
        excedentRegleLe: null,
      };
    } else if (statut === 'REFUSE') {
      where = { schoolId, statut: { in: ['REJETE', 'RETIRE'] } };
    } else if (statut) {
      if (!STATUTS.includes(statut as BankPaymentStatus)) {
        throw new BadRequestException(
          pick({ fr: 'Statut inconnu.', en: 'Unknown status.' }),
        );
      }
      where = { schoolId, statut: statut as BankPaymentStatus };
    }
    const rows = await this.prisma.bankPaymentClaim.findMany({
      where,
      include: CLAIM_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toStaffView(r));
  }

  async findOne(id: string) {
    return this.toStaffView(await this.loadClaim(id));
  }

  private async loadClaim(id: string): Promise<ClaimRow> {
    const schoolId = await this.schoolService.getDefaultId();
    const claim = await this.prisma.bankPaymentClaim.findFirst({
      where: { id, schoolId },
      include: CLAIM_INCLUDE,
    });
    if (!claim) {
      throw new NotFoundException(
        pick({
          fr: 'Déclaration introuvable.',
          en: 'Declaration not found.',
        }),
      );
    }
    return claim;
  }

  /** Une preuve ne se lit que par sa route protégée ; chaque lecture est journalisée (données bancaires). */
  async proofFile(id: string, proofId: string, userId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const proof = await this.prisma.bankPaymentProof.findFirst({
      where: { id: proofId, claimId: id, claim: { schoolId } },
    });
    if (!proof || !isStoredBankProofName(proof.fichier)) {
      throw new NotFoundException(
        pick({ fr: 'Preuve introuvable.', en: 'Proof not found.' }),
      );
    }
    const path = bankProofPath(proof.fichier);
    if (!existsSync(path)) {
      throw new NotFoundException(
        pick({ fr: 'Preuve introuvable.', en: 'Proof not found.' }),
      );
    }
    await this.audit.log({
      schoolId,
      userId,
      action: 'BANK_PAYMENT_PROOF_READ',
      entite: 'BankPaymentClaim',
      entiteId: id,
      nouvelleValeur: { proofId },
    });
    return { path, type: proof.mimeType, nom: proof.nomAffiche };
  }

  private toStaffView(c: ClaimRow) {
    const parent = c.guardian
      ? {
          nom: fullName(c.guardian),
          telephone: c.guardian.telephone,
        }
      : null;
    return {
      id: c.id,
      statut: c.statut,
      methode: c.methode,
      montant: c.montant,
      banque: c.banque,
      compte: c.compte,
      referenceOperation: c.referenceOperation,
      dateOperation: c.dateOperation,
      payeur: c.payeur,
      note: c.note,
      createdAt: c.createdAt,
      declarant: c.declaredByUser
        ? { type: 'PERSONNEL' as const, nom: fullName(c.declaredByUser) }
        : { type: 'PARENT' as const, nom: parent?.nom ?? null },
      declareParId: c.declaredByUser?.id ?? null,
      famille: parent,
      montantCredite: c.montantCredite,
      dateCredit: c.dateCredit,
      referenceReleve: c.referenceReleve,
      confirmePar: fullName(c.confirmePar),
      confirmeParId: c.confirmeParId,
      confirmeLe: c.confirmeLe,
      validePar: fullName(c.validePar),
      valideLe: c.valideLe,
      excedent: c.excedent,
      motifExcedent: c.motifExcedent,
      excedentRegle: c.excedentRegleLe !== null,
      motifRegle: c.motifRegle,
      motifRejet: c.motifRejet,
      rejeteLe: c.rejeteLe,
      preuves: c.proofs,
      lignes: c.lines.map((l) => {
        const enrollment = l.invoiceLine.invoice.enrollment;
        return {
          id: l.id,
          trancheId: l.invoiceLineId,
          libelle: l.invoiceLine.libelle,
          eleve: enrollment.student,
          classe: enrollment.class.nom,
          montantDeclare: l.montantDeclare,
          montantValide: l.montantValide,
          // Solde d'aujourd'hui : il a pu baisser depuis la déclaration (paiement au guichet entre-temps).
          soldeActuel:
            l.invoiceLine.invoice.statut === 'ANNULEE'
              ? 0
              : soldeOf(l.invoiceLine),
          paiement: l.payment,
        };
      }),
    };
  }

  /** Ce que le parent voit : jamais le nom d'un membre du personnel, ni un identifiant interne de facturation. */
  private toPortalView(c: ClaimRow) {
    return {
      id: c.id,
      statut: c.statut,
      methode: c.methode,
      montant: c.montant,
      banque: c.banque,
      referenceOperation: c.referenceOperation,
      dateOperation: c.dateOperation,
      createdAt: c.createdAt,
      pieces: c.proofs.length,
      motifRejet: c.statut === 'REJETE' ? c.motifRejet : null,
      excedent: c.statut === 'VALIDE' ? c.excedent : 0,
      excedentRegle: c.excedentRegleLe !== null,
      lignes: c.lines.map((l) => {
        const enrollment = l.invoiceLine.invoice.enrollment;
        return {
          libelle: l.invoiceLine.libelle,
          eleve: {
            id: enrollment.student.id,
            prenom: enrollment.student.prenom,
          },
          montantDeclare: l.montantDeclare,
          montantValide: l.montantValide,
          paiement: l.payment
            ? { id: l.payment.id, numeroRecu: l.payment.numeroRecu }
            : null,
        };
      }),
    };
  }

  async portalList(guardianId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const rows = await this.prisma.bankPaymentClaim.findMany({
      where: { schoolId, guardianId },
      include: CLAIM_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.toPortalView(r));
  }

  // ------------------------------------------------------------------ circuit

  /**
   * Confirmation par le Promoteur : le crédit figure bien sur le relevé de la banque. Jamais par celui qui a déclaré.
   * `montantCredite` est ce que la banque a réellement crédité : c'est lui qui plafonne la validation.
   */
  async confirm(id: string, dto: ConfirmBankPaymentDto, userId: string) {
    const before = await this.loadClaim(id);
    if (before.statut !== 'EN_ATTENTE') {
      throw new ConflictException(
        pick({
          fr: 'Cette déclaration a déjà été traitée.',
          en: 'This declaration has already been processed.',
        }),
      );
    }
    if (before.declaredByUser?.id === userId) {
      throw new ForbiddenException(
        pick({
          fr: 'Vous ne pouvez pas confirmer une déclaration que vous avez faite vous-même.',
          en: 'You cannot confirm a declaration you made yourself.',
        }),
      );
    }
    const credit = parseDay(dto.dateCredit);
    if (
      Number.isNaN(credit.getTime()) ||
      credit.getTime() > Date.now() + 36 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        pick({
          fr: 'La date du crédit est invalide ou dans le futur.',
          en: 'The credit date is invalid or in the future.',
        }),
      );
    }
    const schoolId = await this.schoolService.getDefaultId();
    const result = await this.prisma.bankPaymentClaim.updateMany({
      where: { id, schoolId, statut: 'EN_ATTENTE' },
      data: {
        statut: 'CREDIT_CONFIRME',
        montantCredite: dto.montantCredite,
        dateCredit: credit,
        referenceReleve: dto.referenceReleve?.trim() || null,
        confirmeParId: userId,
        confirmeLe: new Date(),
      },
    });
    if (result.count === 0) {
      throw new ConflictException(
        pick({
          fr: 'Cette déclaration vient d’être traitée par quelqu’un d’autre.',
          en: 'This declaration has just been processed by someone else.',
        }),
      );
    }
    await this.audit.log({
      schoolId,
      userId,
      action: 'BANK_PAYMENT_CONFIRM',
      entite: 'BankPaymentClaim',
      entiteId: id,
      ancienneValeur: { statut: before.statut, montant: before.montant },
      nouvelleValeur: {
        statut: 'CREDIT_CONFIRME',
        montantCredite: dto.montantCredite,
      },
    });
    return this.findOne(id);
  }

  /**
   * Validation par le secrétariat : crée un paiement et son reçu (RG10) par tranche, au montant imputé, plafonné au solde
   * du jour (RG08). Ni celui qui a déclaré ni celui qui a confirmé ne valident. Le crédit non imputable devient un
   * excédent à rembourser hors application, avec un motif obligatoire.
   */
  async validate(id: string, dto: ValidateBankPaymentDto, userId: string) {
    const claim = await this.loadClaim(id);
    if (claim.statut !== 'CREDIT_CONFIRME') {
      throw new ConflictException(
        pick({
          fr: 'Le crédit de cette déclaration doit d’abord être confirmé par le Promoteur.',
          en: "This declaration's credit must first be confirmed by the Promoter.",
        }),
      );
    }
    if (claim.confirmeParId === userId || claim.declaredByUser?.id === userId) {
      throw new ForbiddenException(
        pick({
          fr: 'Vous ne pouvez pas valider une déclaration que vous avez faite ou confirmée vous-même : une autre personne doit le faire.',
          en: 'You cannot validate a declaration you made or confirmed yourself: another person must do it.',
        }),
      );
    }
    const credited = claim.montantCredite ?? 0;

    const allocations = new Map<string, number>(
      claim.lines.map((l) => [l.invoiceLineId, l.montantDeclare]),
    );
    if (dto.allocations) {
      const seen = new Set<string>();
      for (const a of dto.allocations) {
        if (!allocations.has(a.trancheId) || seen.has(a.trancheId)) {
          throw new BadRequestException(
            pick({
              fr: 'Une tranche indiquée ne fait pas partie de cette déclaration.',
              en: 'An instalment given is not part of this declaration.',
            }),
          );
        }
        seen.add(a.trancheId);
      }
      // Les tranches non indiquées ne reçoivent rien.
      for (const key of allocations.keys()) allocations.set(key, 0);
      for (const a of dto.allocations) allocations.set(a.trancheId, a.montant);
    }
    const total = [...allocations.values()].reduce((s, m) => s + m, 0);
    if (total <= 0) {
      throw new BadRequestException(
        pick({
          fr: 'Rien à imputer : refusez la déclaration, ou indiquez au moins une tranche à payer.',
          en: 'Nothing to apply: reject the declaration, or enter at least one instalment to pay.',
        }),
      );
    }
    if (total > credited) {
      throw new BadRequestException(
        pick({
          fr: `Le total imputé (${total} XAF) dépasse le crédit confirmé (${credited} XAF).`,
          en: `The total applied (${total} XAF) exceeds the confirmed credit (${credited} XAF).`,
        }),
      );
    }
    const excedent = credited - total;
    const motifExcedent = dto.motifExcedent?.trim();
    if (excedent > 0 && !motifExcedent) {
      throw new BadRequestException(
        pick({
          fr: `${excedent} XAF crédités ne sont pas imputés : indiquez pourquoi (remboursement hors application).`,
          en: `${excedent} XAF credited are not applied: say why (refund outside the application).`,
        }),
      );
    }

    const schoolId = await this.schoolService.getDefaultId();
    const created = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.bankPaymentClaim.updateMany({
        where: { id, schoolId, statut: 'CREDIT_CONFIRME' },
        data: {
          statut: 'VALIDE',
          valideParId: userId,
          valideLe: new Date(),
          excedent,
          motifExcedent: excedent > 0 ? motifExcedent : null,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          pick({
            fr: 'Cette déclaration vient d’être traitée par quelqu’un d’autre.',
            en: 'This declaration has just been processed by someone else.',
          }),
        );
      }
      const payments: Array<{
        id: string;
        numeroRecu: string;
        montant: number;
      }> = [];
      for (const line of claim.lines) {
        const montant = allocations.get(line.invoiceLineId) ?? 0;
        if (montant === 0) {
          await tx.bankPaymentClaimLine.update({
            where: { id: line.id },
            data: { montantValide: 0 },
          });
          continue;
        }
        const target = await tx.invoiceLine.findUniqueOrThrow({
          where: { id: line.invoiceLineId },
          include: {
            invoice: true,
            discounts: true,
            payments: { where: { statut: 'VALIDE' } },
          },
        });
        const solde = target.invoice.statut === 'ANNULEE' ? 0 : soldeOf(target);
        if (montant > solde) {
          throw new ConflictException(
            pick({
              fr: `« ${target.libelle} » n'a plus que ${solde} XAF à payer (un paiement a eu lieu entre-temps). Baissez le montant imputé ; le reste devient un excédent à rembourser.`,
              en: `"${target.libelle}" only has ${solde} XAF left to pay (a payment was made in the meantime). Lower the amount applied; the rest becomes a surplus to refund.`,
            }),
          );
        }
        // Numéro de reçu attribué DANS la transaction : si elle échoue, aucun numéro n'est consommé (RG10).
        const sequence = await tx.numberSequence.upsert({
          where: {
            schoolId_type_scope: { schoolId, type: 'RECEIPT', scope: '' },
          },
          create: { schoolId, type: 'RECEIPT', scope: '', dernierNumero: 1 },
          update: { dernierNumero: { increment: 1 } },
        });
        const payment = await tx.payment.create({
          data: {
            schoolId,
            invoiceLineId: line.invoiceLineId,
            montant,
            modePaiement: claim.methode,
            referenceExterne: claim.referenceOperation,
            dateOperation: claim.dateOperation,
            numeroRecu: `REC-${String(sequence.dernierNumero).padStart(RECEIPT_NUMERO_DIGITS, '0')}`,
            // Le caissier du reçu est celui qui valide : sa signature figure sur le reçu, il ne l'annule pas lui-même (RG09).
            recuParUserId: userId,
          },
        });
        await tx.bankPaymentClaimLine.update({
          where: { id: line.id },
          data: { paymentId: payment.id, montantValide: montant },
        });
        payments.push({
          id: payment.id,
          numeroRecu: payment.numeroRecu,
          montant,
        });
      }
      return payments;
    });

    await this.audit.log({
      schoolId,
      userId,
      action: 'BANK_PAYMENT_VALIDATE',
      entite: 'BankPaymentClaim',
      entiteId: id,
      nouvelleValeur: {
        paiements: created,
        excedent,
        montantCredite: credited,
      },
    });
    return this.findOne(id);
  }

  /** Refus avec motif, par le secrétariat ou le Promoteur : le parent le lit et peut déclarer de nouveau. */
  async reject(id: string, dto: RejectBankPaymentDto, userId: string) {
    const before = await this.loadClaim(id);
    if (!OPEN.includes(before.statut)) {
      throw new ConflictException(
        pick({
          fr: 'Cette déclaration a déjà été traitée.',
          en: 'This declaration has already been processed.',
        }),
      );
    }
    const schoolId = await this.schoolService.getDefaultId();
    const result = await this.prisma.bankPaymentClaim.updateMany({
      where: { id, schoolId, statut: { in: OPEN } },
      data: {
        statut: 'REJETE',
        rejeteParId: userId,
        rejeteLe: new Date(),
        motifRejet: dto.motif.trim(),
      },
    });
    if (result.count === 0) {
      throw new ConflictException(
        pick({
          fr: 'Cette déclaration vient d’être traitée par quelqu’un d’autre.',
          en: 'This declaration has just been processed by someone else.',
        }),
      );
    }
    await this.audit.log({
      schoolId,
      userId,
      action: 'BANK_PAYMENT_REJECT',
      entite: 'BankPaymentClaim',
      entiteId: id,
      ancienneValeur: { statut: before.statut },
      nouvelleValeur: { statut: 'REJETE', motif: dto.motif.trim() },
    });
    return this.findOne(id);
  }

  /** Le parent retire sa déclaration tant que personne ne l'a traitée. */
  async withdraw(guardianId: string, id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const claim = await this.prisma.bankPaymentClaim.findFirst({
      where: { id, schoolId, guardianId, declaredByUserId: null },
    });
    if (!claim) {
      throw new NotFoundException(
        pick({
          fr: 'Déclaration introuvable.',
          en: 'Declaration not found.',
        }),
      );
    }
    const result = await this.prisma.bankPaymentClaim.updateMany({
      where: { id, schoolId, guardianId, statut: 'EN_ATTENTE' },
      data: { statut: 'RETIRE', rejeteLe: new Date() },
    });
    if (result.count === 0) {
      throw new ConflictException(
        pick({
          fr: 'Cette déclaration est déjà en cours de traitement : elle ne peut plus être retirée.',
          en: 'This declaration is already being processed: it can no longer be withdrawn.',
        }),
      );
    }
    await this.audit.log({
      schoolId,
      userId: null,
      action: 'BANK_PAYMENT_WITHDRAW',
      entite: 'BankPaymentClaim',
      entiteId: id,
      nouvelleValeur: { guardianId },
    });
    const updated = await this.prisma.bankPaymentClaim.findFirstOrThrow({
      where: { id },
      include: CLAIM_INCLUDE,
    });
    return this.toPortalView(updated);
  }

  /** L'excédent a été remboursé hors application : on le clôture avec un motif. */
  async resolveSurplus(id: string, dto: ResolveSurplusDto, userId: string) {
    const claim = await this.loadClaim(id);
    if (claim.statut !== 'VALIDE' || claim.excedent <= 0) {
      throw new ConflictException(
        pick({
          fr: "Cette déclaration n'a aucun excédent à régler.",
          en: 'This declaration has no surplus to settle.',
        }),
      );
    }
    const schoolId = await this.schoolService.getDefaultId();
    const result = await this.prisma.bankPaymentClaim.updateMany({
      where: { id, schoolId, excedentRegleLe: null },
      data: {
        excedentRegleLe: new Date(),
        excedentRegleParId: userId,
        motifRegle: dto.motif.trim(),
      },
    });
    if (result.count === 0) {
      throw new ConflictException(
        pick({
          fr: 'Cet excédent est déjà réglé.',
          en: 'This surplus is already settled.',
        }),
      );
    }
    await this.audit.log({
      schoolId,
      userId,
      action: 'BANK_PAYMENT_SURPLUS_RESOLVE',
      entite: 'BankPaymentClaim',
      entiteId: id,
      nouvelleValeur: { excedent: claim.excedent, motif: dto.motif.trim() },
    });
    return this.findOne(id);
  }
}

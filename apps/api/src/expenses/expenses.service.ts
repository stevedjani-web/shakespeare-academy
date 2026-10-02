import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ExpenseStatus, Prisma } from '@prisma/client';
import { existsSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { pick } from '../common/language';
import type { CurrentUserData } from '../auth/types/current-user.interface';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { RejectExpenseDto } from './dto/reject-expense.dto';
import { CancelExpenseDto } from './dto/cancel-expense.dto';
import { DisburseExpenseDto } from './dto/disburse-expense.dto';
import {
  checkExpenseFile,
  expenseFilePath,
  isStoredExpenseFileName,
  MAX_JUSTIFICATIFS,
  removeExpenseFile,
  storeExpenseFile,
  type IncomingFile,
} from './expense-files';

const USER_SELECT = { select: { id: true, nom: true, prenom: true } };

// Jamais le nom du fichier stocké : une pièce ne se lit que par sa route protégée.
const EXPENSE_INCLUDE = {
  effectuePar: USER_SELECT,
  approbateur: USER_SELECT,
  decaissePar: USER_SELECT,
  annulePar: USER_SELECT,
  attachments: {
    select: {
      id: true,
      kind: true,
      nomAffiche: true,
      mimeType: true,
      taille: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

type ExpenseView = Prisma.ExpenseGetPayload<{
  include: typeof EXPENSE_INCLUDE;
}>;

const STATUTS: readonly ExpenseStatus[] = [
  'EN_ATTENTE',
  'APPROUVEE',
  'REJETEE',
  'DECAISSEE',
  'ANNULEE',
];

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  async findAll(statut?: string, from?: string, to?: string) {
    if (statut && !STATUTS.includes(statut as ExpenseStatus)) {
      throw new BadRequestException(
        pick({ fr: 'Statut inconnu.', en: 'Unknown status.' }),
      );
    }
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.expense.findMany({
      where: {
        schoolId,
        statut: (statut as ExpenseStatus) || undefined,
        dateDepense:
          from || to
            ? {
                gte: from ? new Date(from) : undefined,
                lt: to ? new Date(to) : undefined,
              }
            : undefined,
      },
      include: EXPENSE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const expense = await this.prisma.expense.findFirst({
      where: { id, schoolId },
      include: EXPENSE_INCLUDE,
    });
    if (!expense) {
      throw new NotFoundException('Sortie financière introuvable.');
    }
    return expense;
  }

  /**
   * Demande de sortie : toujours EN_ATTENTE, avec au moins un justificatif (devis, facture proforma, bon de commande).
   * Rien n'est compté dans la caisse avant le décaissement. Les fichiers ne sont écrits qu'une fois TOUS validés (type
   * lu dans le contenu), et retirés si l'enregistrement échoue : jamais de pièce orpheline.
   */
  async create(
    dto: CreateExpenseDto,
    incoming: IncomingFile[],
    actingUserId: string,
  ) {
    if (incoming.length === 0) {
      throw new BadRequestException(
        pick({
          fr: 'Joignez au moins un justificatif (devis, facture proforma ou bon de commande).',
          en: 'Attach at least one supporting document (quote, pro-forma invoice or purchase order).',
        }),
      );
    }
    if (incoming.length > MAX_JUSTIFICATIFS) {
      throw new BadRequestException(
        pick({
          fr: `Une demande porte au plus ${MAX_JUSTIFICATIFS} justificatifs.`,
          en: `A request carries at most ${MAX_JUSTIFICATIFS} supporting documents.`,
        }),
      );
    }
    const checked = incoming.map(checkExpenseFile);
    const schoolId = await this.schoolService.getDefaultId();

    const stored: string[] = [];
    let expense: ExpenseView;
    try {
      for (const file of checked) stored.push(await storeExpenseFile(file));
      expense = await this.prisma.expense.create({
        data: {
          schoolId,
          categorie: dto.categorie,
          montant: dto.montant,
          description: dto.description,
          beneficiaire: dto.beneficiaire?.trim() || undefined,
          dateDepense: dto.dateDepense ? new Date(dto.dateDepense) : undefined,
          effectueParId: actingUserId,
          attachments: {
            create: checked.map((file, index) => ({
              kind: 'JUSTIFICATIF' as const,
              fichier: stored[index],
              nomAffiche: file.nomAffiche,
              mimeType: file.detected.type,
              taille: file.buffer.length,
              ajouteParId: actingUserId,
            })),
          },
        },
        include: EXPENSE_INCLUDE,
      });
    } catch (error) {
      await Promise.all(stored.map((name) => removeExpenseFile(name)));
      throw error;
    }

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'EXPENSE_CREATE',
      entite: 'Expense',
      entiteId: expense.id,
      nouvelleValeur: expense,
    });

    return expense;
  }

  async attachmentFile(expenseId: string, attachmentId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const attachment = await this.prisma.expenseAttachment.findFirst({
      where: { id: attachmentId, expenseId, expense: { schoolId } },
    });
    if (!attachment || !isStoredExpenseFileName(attachment.fichier)) {
      throw new NotFoundException('Pièce introuvable.');
    }
    const path = expenseFilePath(attachment.fichier);
    if (!existsSync(path)) throw new NotFoundException('Pièce introuvable.');
    return { path, type: attachment.mimeType, nom: attachment.nomAffiche };
  }

  async approve(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.statut !== 'EN_ATTENTE') {
      throw new ConflictException(
        'Seule une sortie en attente peut être approuvée.',
      );
    }
    // D25 : celui qui enregistre une sortie ne l'approuve jamais lui-même.
    if (before.effectueParId === actingUserId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas approuver votre propre sortie financière : un autre responsable doit la valider.',
      );
    }

    const expense = await this.transition(
      id,
      ['EN_ATTENTE'],
      {
        statut: 'APPROUVEE',
        approbateurId: actingUserId,
        dateDecision: new Date(),
      },
      'Seule une sortie en attente peut être approuvée.',
    );
    await this.logTransition('EXPENSE_APPROVE', actingUserId, before, expense);
    return expense;
  }

  async reject(id: string, dto: RejectExpenseDto, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.statut !== 'EN_ATTENTE') {
      throw new ConflictException(
        'Seule une sortie en attente peut être rejetée.',
      );
    }

    const expense = await this.transition(
      id,
      ['EN_ATTENTE'],
      {
        statut: 'REJETEE',
        approbateurId: actingUserId,
        motifRejet: dto.motif,
        dateDecision: new Date(),
      },
      'Seule une sortie en attente peut être rejetée.',
    );
    await this.logTransition('EXPENSE_REJECT', actingUserId, before, expense);
    return expense;
  }

  /**
   * Confirmation de la sortie réelle d'une dépense APPROUVEE : seule elle entre dans la clôture de journée. La date est
   * posée par le serveur (jamais saisie : pas d'antidatage dans une journée déjà clôturée). Celui qui a approuvé ne
   * confirme pas : trois étapes, au moins deux personnes. Hors espèces, une référence est exigée (numéro de virement, de
   * chèque ou de transaction), comme pour un encaissement Mobile Money.
   */
  async disburse(
    id: string,
    dto: DisburseExpenseDto,
    proof: IncomingFile | undefined,
    actingUserId: string,
  ) {
    const before = await this.findOne(id);
    if (before.statut !== 'APPROUVEE') {
      throw new ConflictException(
        pick({
          fr: 'Seule une sortie approuvée, pas encore décaissée, peut être confirmée.',
          en: 'Only an approved expense that has not yet been paid out can be confirmed.',
        }),
      );
    }
    if (before.approbateurId === actingUserId) {
      throw new ForbiddenException(
        pick({
          fr: 'Vous ne pouvez pas confirmer la sortie d’une dépense que vous avez vous-même approuvée : un autre responsable doit le faire.',
          en: 'You cannot confirm the payout of an expense you approved yourself: another officer must do it.',
        }),
      );
    }
    const reference = dto.reference?.trim();
    if (dto.modePaiement !== 'ESPECES' && !reference) {
      throw new BadRequestException(
        pick({
          fr: 'Indiquez la référence du paiement (numéro de virement, de chèque ou de transaction).',
          en: 'Enter the payment reference (transfer, cheque or transaction number).',
        }),
      );
    }
    const checkedProof = proof ? checkExpenseFile(proof) : null;
    const schoolId = await this.schoolService.getDefaultId();

    let storedProof: string | null = null;
    let expense: ExpenseView | null;
    try {
      if (checkedProof) storedProof = await storeExpenseFile(checkedProof);
      expense = await this.prisma.$transaction(async (tx) => {
        const result = await tx.expense.updateMany({
          where: { id, schoolId, statut: 'APPROUVEE' },
          data: {
            statut: 'DECAISSEE',
            decaisseParId: actingUserId,
            dateDecaissement: new Date(),
            modeDecaissement: dto.modePaiement,
            referenceDecaissement: reference || null,
          },
        });
        if (result.count === 0) return null;
        if (checkedProof && storedProof) {
          await tx.expenseAttachment.create({
            data: {
              expenseId: id,
              kind: 'PREUVE_DECAISSEMENT',
              fichier: storedProof,
              nomAffiche: checkedProof.nomAffiche,
              mimeType: checkedProof.detected.type,
              taille: checkedProof.buffer.length,
              ajouteParId: actingUserId,
            },
          });
        }
        return tx.expense.findUniqueOrThrow({
          where: { id },
          include: EXPENSE_INCLUDE,
        });
      });
    } catch (error) {
      await removeExpenseFile(storedProof);
      throw error;
    }
    if (!expense) {
      await removeExpenseFile(storedProof);
      throw new ConflictException(
        pick({
          fr: 'Cette sortie vient d’être traitée par quelqu’un d’autre.',
          en: 'This expense has just been handled by someone else.',
        }),
      );
    }

    await this.logTransition('EXPENSE_DISBURSE', actingUserId, before, expense);
    return expense;
  }

  /**
   * Annulation, avec motif : le demandeur retire sa demande tant qu'elle attend, et le responsable qui approuve
   * (Promoteur, Direction) annule une sortie approuvée qui n'a pas été payée. Une sortie décaissée ne s'annule plus :
   * l'argent est sorti (même principe que RG09 pour un paiement validé).
   */
  async cancel(id: string, dto: CancelExpenseDto, user: CurrentUserData) {
    const before = await this.findOne(id);
    const canApprove = user.permissions.includes('EXPENSE_APPROVE');
    if (before.statut === 'EN_ATTENTE') {
      if (before.effectueParId !== user.id && !canApprove) {
        throw new ForbiddenException(
          pick({
            fr: 'Seul le demandeur ou un responsable qui approuve peut annuler cette demande.',
            en: 'Only the requester or an approving officer can cancel this request.',
          }),
        );
      }
    } else if (before.statut === 'APPROUVEE') {
      if (!canApprove) {
        throw new ForbiddenException(
          pick({
            fr: 'Seul un responsable qui approuve peut annuler une sortie approuvée.',
            en: 'Only an approving officer can cancel an approved expense.',
          }),
        );
      }
    } else {
      throw new ConflictException(
        before.statut === 'DECAISSEE'
          ? pick({
              fr: 'Une sortie déjà décaissée ne peut plus être annulée.',
              en: 'An expense that has already been paid out can no longer be cancelled.',
            })
          : pick({
              fr: 'Cette sortie est déjà rejetée ou annulée.',
              en: 'This expense is already rejected or cancelled.',
            }),
      );
    }

    const expense = await this.transition(
      id,
      [before.statut],
      {
        statut: 'ANNULEE',
        annuleParId: user.id,
        dateAnnulation: new Date(),
        motifAnnulation: dto.motif,
      },
      pick({
        fr: 'Cette sortie vient d’être traitée par quelqu’un d’autre.',
        en: 'This expense has just been handled by someone else.',
      }),
    );
    await this.logTransition('EXPENSE_CANCEL', user.id, before, expense);
    return expense;
  }

  /** Changement d'état atomique : refusé (409) si la sortie n'est plus dans l'état attendu au moment de l'écriture. */
  private async transition(
    id: string,
    from: ExpenseStatus[],
    data: Prisma.ExpenseUncheckedUpdateManyInput,
    conflictMessage: string,
  ) {
    const schoolId = await this.schoolService.getDefaultId();
    const result = await this.prisma.expense.updateMany({
      where: { id, schoolId, statut: { in: from } },
      data,
    });
    if (result.count === 0) throw new ConflictException(conflictMessage);
    return this.findOne(id);
  }

  private async logTransition(
    action: string,
    userId: string,
    before: unknown,
    after: unknown,
  ) {
    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId,
      action,
      entite: 'Expense',
      entiteId: (after as { id: string }).id,
      ancienneValeur: before,
      nouvelleValeur: after,
    });
  }
}

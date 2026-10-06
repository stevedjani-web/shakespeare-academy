import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BankDepositStatus, Prisma } from '@prisma/client';
import { existsSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { pick } from '../common/language';
import { checkExpenseFile, type IncomingFile } from '../expenses/expense-files';
import { CreateBankDepositDto } from './dto/create-bank-deposit.dto';
import { RejectBankDepositDto } from './dto/reject-bank-deposit.dto';
import {
  depositFilePath,
  isStoredDepositFileName,
  removeDepositFile,
  storeDepositFile,
} from './deposit-files';

const USER_SELECT = { select: { id: true, nom: true, prenom: true } };

// Jamais le nom du fichier stocké : le bordereau ne se lit que par sa route protégée.
const DEPOSIT_SELECT = {
  id: true,
  montant: true,
  dateVersement: true,
  banque: true,
  numeroBordereau: true,
  note: true,
  statut: true,
  declarePar: USER_SELECT,
  verifiePar: USER_SELECT,
  dateVerification: true,
  motifRejet: true,
  nomAffiche: true,
  mimeType: true,
  taille: true,
  createdAt: true,
} satisfies Prisma.BankDepositSelect;

type DepositView = Prisma.BankDepositGetPayload<{
  select: typeof DEPOSIT_SELECT;
}>;

const STATUTS: readonly BankDepositStatus[] = [
  'EN_ATTENTE',
  'CONFIRME',
  'REJETE',
];

/** Un versement rejeté rend l'argent à la caisse : seuls ceux-ci le retirent. */
const COUNTED: BankDepositStatus[] = ['EN_ATTENTE', 'CONFIRME'];

/** Clé de comparaison d'un bordereau : un même reçu de banque ne sert jamais deux fois, quelle que soit la casse ou les espaces. */
function slipKey(banque: string, numero: string): string {
  const clean = (s: string) =>
    s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  return `${clean(banque)}|${clean(numero)}`;
}

@Injectable()
export class BankDepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  /**
   * Espèces qui devraient se trouver dans le tiroir à la fin de `upTo` (exclu), ou aujourd'hui : TOUS les encaissements
   * en espèces (reprises d'avant l'application comprises : cet argent, reçu avant l'application, est lui aussi à verser ;
   * jamais le Mobile Money, qui ne passe pas par le tiroir), moins les sorties payées en espèces (une ancienne sortie sans
   * mode est comptée en espèces, comme avant), moins les versements en banque non rejetés. Un montant théorique : il sert
   * à contrôler, pas à constater.
   */
  async getCashOnHand(schoolId: string, upTo?: Date) {
    const [encaisse, depense, verse] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          schoolId,
          statut: 'VALIDE',
          modePaiement: 'ESPECES',
          ...(upTo ? { datePaiement: { lt: upTo } } : {}),
        },
        _sum: { montant: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          schoolId,
          statut: 'DECAISSEE',
          OR: [{ modeDecaissement: 'ESPECES' }, { modeDecaissement: null }],
          ...(upTo ? { dateDecaissement: { lt: upTo } } : {}),
        },
        _sum: { montant: true },
      }),
      this.prisma.bankDeposit.aggregate({
        where: {
          schoolId,
          statut: { in: COUNTED },
          ...(upTo ? { dateVersement: { lt: upTo } } : {}),
        },
        _sum: { montant: true },
      }),
    ]);
    const encaisseTotal = encaisse._sum.montant ?? 0;
    const depenseTotal = depense._sum.montant ?? 0;
    const verseTotal = verse._sum.montant ?? 0;
    return {
      encaisseEspeces: encaisseTotal,
      sortiesEspeces: depenseTotal,
      verse: verseTotal,
      enCaisse: encaisseTotal - depenseTotal - verseTotal,
    };
  }

  async summary() {
    const schoolId = await this.schoolService.getDefaultId();
    const [cash, groups] = await Promise.all([
      this.getCashOnHand(schoolId),
      this.prisma.bankDeposit.groupBy({
        by: ['statut'],
        where: { schoolId },
        _sum: { montant: true },
        _count: true,
      }),
    ]);
    const of = (statut: BankDepositStatus) => {
      const g = groups.find((x) => x.statut === statut);
      return { count: g?._count ?? 0, total: g?._sum.montant ?? 0 };
    };
    return {
      ...cash,
      aVerifier: of('EN_ATTENTE'),
      confirmes: of('CONFIRME'),
      rejetes: of('REJETE'),
    };
  }

  async findAll(statut?: string) {
    if (statut && !STATUTS.includes(statut as BankDepositStatus)) {
      throw new BadRequestException(
        pick({ fr: 'Statut inconnu.', en: 'Unknown status.' }),
      );
    }
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.bankDeposit.findMany({
      where: { schoolId, statut: (statut as BankDepositStatus) || undefined },
      select: DEPOSIT_SELECT,
      orderBy: [{ dateVersement: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const deposit = await this.prisma.bankDeposit.findFirst({
      where: { id, schoolId },
      select: DEPOSIT_SELECT,
    });
    if (!deposit) throw new NotFoundException('Versement introuvable.');
    return deposit;
  }

  /**
   * Déclaration d'un versement déjà fait, avec son bordereau (obligatoire). Refusée si le montant dépasse les espèces
   * qui devraient être en caisse (RG08 : jamais plus que ce qui existe) ou si ce bordereau a déjà servi. Le fichier n'est
   * écrit qu'une fois tout validé et retiré si l'enregistrement échoue.
   */
  async create(
    dto: CreateBankDepositDto,
    receipt: IncomingFile | undefined,
    actingUserId: string,
  ) {
    if (!receipt) {
      throw new BadRequestException(
        pick({
          fr: 'Joignez le bordereau de versement de la banque.',
          en: "Attach the bank's deposit slip.",
        }),
      );
    }
    const checked = checkExpenseFile(receipt);

    const date = new Date(`${dto.dateVersement}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        pick({
          fr: 'La date du versement est invalide.',
          en: 'The deposit date is invalid.',
        }),
      );
    }
    // Tolérance d'un jour : l'heure locale de l'établissement précède l'heure UTC.
    if (date.getTime() > Date.now() + 36 * 60 * 60 * 1000) {
      throw new BadRequestException(
        pick({
          fr: 'La date du versement ne peut pas être dans le futur.',
          en: 'The deposit date cannot be in the future.',
        }),
      );
    }

    const schoolId = await this.schoolService.getDefaultId();
    const key = slipKey(dto.banque, dto.numeroBordereau);
    const stored = await storeDepositFile(checked);
    let deposit: DepositView;
    try {
      deposit = await this.prisma.$transaction(async (tx) => {
        // Deux déclarations simultanées du même bordereau ou de montants qui se cumuleraient au-delà de la caisse :
        // on les passe l'une après l'autre.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'bank-deposit:' + schoolId}))`;

        const sameSlip = await tx.bankDeposit.findMany({
          where: { schoolId, statut: { in: COUNTED } },
          select: { banque: true, numeroBordereau: true },
        });
        if (
          sameSlip.some((d) => slipKey(d.banque, d.numeroBordereau) === key)
        ) {
          throw new ConflictException(
            pick({
              fr: 'Ce bordereau a déjà été déclaré pour cette banque.',
              en: 'This deposit slip has already been declared for this bank.',
            }),
          );
        }

        const cash = await this.getCashOnHandIn(tx, schoolId);
        if (dto.montant > cash) {
          throw new ConflictException(
            pick({
              fr: `Le montant dépasse les espèces qui devraient être en caisse (${cash} XAF).`,
              en: `The amount exceeds the cash that should be in the till (${cash} XAF).`,
            }),
          );
        }

        return tx.bankDeposit.create({
          data: {
            schoolId,
            montant: dto.montant,
            dateVersement: date,
            banque: dto.banque.trim(),
            numeroBordereau: dto.numeroBordereau.trim(),
            note: dto.note?.trim() || null,
            declareParId: actingUserId,
            fichier: stored,
            nomAffiche: checked.nomAffiche,
            mimeType: checked.detected.type,
            taille: checked.buffer.length,
          },
          select: DEPOSIT_SELECT,
        });
      });
    } catch (error) {
      await removeDepositFile(stored);
      throw error;
    }

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'BANK_DEPOSIT_CREATE',
      entite: 'BankDeposit',
      entiteId: deposit.id,
      nouvelleValeur: deposit,
    });
    return deposit;
  }

  /** Même calcul que `getCashOnHand`, dans la transaction qui contrôle le plafond. */
  private async getCashOnHandIn(
    tx: Prisma.TransactionClient,
    schoolId: string,
  ): Promise<number> {
    const [encaisse, depense, verse] = await Promise.all([
      tx.payment.aggregate({
        where: {
          schoolId,
          statut: 'VALIDE',
          modePaiement: 'ESPECES',
        },
        _sum: { montant: true },
      }),
      tx.expense.aggregate({
        where: {
          schoolId,
          statut: 'DECAISSEE',
          OR: [{ modeDecaissement: 'ESPECES' }, { modeDecaissement: null }],
        },
        _sum: { montant: true },
      }),
      tx.bankDeposit.aggregate({
        where: { schoolId, statut: { in: COUNTED } },
        _sum: { montant: true },
      }),
    ]);
    return (
      (encaisse._sum.montant ?? 0) -
      (depense._sum.montant ?? 0) -
      (verse._sum.montant ?? 0)
    );
  }

  async receiptFile(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const deposit = await this.prisma.bankDeposit.findFirst({
      where: { id, schoolId },
    });
    if (!deposit || !isStoredDepositFileName(deposit.fichier)) {
      throw new NotFoundException('Bordereau introuvable.');
    }
    const path = depositFilePath(deposit.fichier);
    if (!existsSync(path))
      throw new NotFoundException('Bordereau introuvable.');
    return { path, type: deposit.mimeType, nom: deposit.nomAffiche };
  }

  /**
   * Confirmation après comparaison du bordereau au relevé de la banque. Jamais par celui qui a déclaré : deux personnes
   * au moins touchent à chaque versement. Une fois confirmé, il ne change plus (RG09).
   */
  async confirm(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    this.assertVerifiable(before, actingUserId);
    const after = await this.transition(id, {
      statut: 'CONFIRME',
      verifieParId: actingUserId,
      dateVerification: new Date(),
    });
    await this.log('BANK_DEPOSIT_CONFIRM', actingUserId, before, after);
    return after;
  }

  /** Rejet avec motif : le montant revient dans les espèces en caisse et le bordereau peut être déclaré à nouveau. */
  async reject(id: string, dto: RejectBankDepositDto, actingUserId: string) {
    const before = await this.findOne(id);
    this.assertVerifiable(before, actingUserId);
    const after = await this.transition(id, {
      statut: 'REJETE',
      verifieParId: actingUserId,
      dateVerification: new Date(),
      motifRejet: dto.motif,
    });
    await this.log('BANK_DEPOSIT_REJECT', actingUserId, before, after);
    return after;
  }

  private assertVerifiable(
    deposit: { statut: BankDepositStatus; declarePar: { id: string } },
    actingUserId: string,
  ) {
    if (deposit.statut !== 'EN_ATTENTE') {
      throw new ConflictException(
        pick({
          fr: 'Ce versement a déjà été vérifié.',
          en: 'This deposit has already been verified.',
        }),
      );
    }
    if (deposit.declarePar.id === actingUserId) {
      throw new ForbiddenException(
        pick({
          fr: 'Vous ne pouvez pas vérifier un versement que vous avez vous-même déclaré : un autre responsable doit le faire.',
          en: 'You cannot verify a deposit you declared yourself: another officer must do it.',
        }),
      );
    }
  }

  /** Changement d'état atomique : refusé (409) si le versement n'est plus en attente au moment de l'écriture. */
  private async transition(
    id: string,
    data: Prisma.BankDepositUncheckedUpdateManyInput,
  ) {
    const schoolId = await this.schoolService.getDefaultId();
    const result = await this.prisma.bankDeposit.updateMany({
      where: { id, schoolId, statut: 'EN_ATTENTE' },
      data,
    });
    if (result.count === 0) {
      throw new ConflictException(
        pick({
          fr: 'Ce versement vient d’être vérifié par quelqu’un d’autre.',
          en: 'This deposit has just been verified by someone else.',
        }),
      );
    }
    return this.findOne(id);
  }

  private async log(
    action: string,
    userId: string,
    before: unknown,
    after: { id: string },
  ) {
    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId,
      action,
      entite: 'BankDeposit',
      entiteId: after.id,
      ancienneValeur: before,
      nouvelleValeur: after,
    });
  }
}

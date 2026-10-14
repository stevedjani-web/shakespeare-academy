import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { pick } from '../common/language';
import type {
  SchoolBankAccountDto,
  UpdateSchoolBankAccountDto,
} from './dto/bank-payments.dto';

/**
 * Comptes bancaires de l'école : l'Administrateur les saisit (Établissement), les parents les voient dans leur espace pour
 * leurs virements et dépôts. Un compte déjà cité par une déclaration ne se supprime pas : on le désactive.
 */
@Injectable()
export class SchoolBankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  async findAll() {
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.schoolBankAccount.findMany({
      where: { schoolId },
      orderBy: [{ actif: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(dto: SchoolBankAccountDto, userId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const account = await this.prisma.schoolBankAccount.create({
      data: {
        schoolId,
        banque: dto.banque.trim(),
        titulaire: dto.titulaire.trim(),
        numero: dto.numero.trim(),
        instructions: dto.instructions?.trim() || null,
        actif: dto.actif ?? true,
      },
    });
    // Le numéro de compte ne figure jamais dans le journal : l'identifiant suffit.
    await this.audit.log({
      schoolId,
      userId,
      action: 'SCHOOL_BANK_ACCOUNT_CREATE',
      entite: 'SchoolBankAccount',
      entiteId: account.id,
      nouvelleValeur: { banque: account.banque, actif: account.actif },
    });
    return account;
  }

  async update(id: string, dto: UpdateSchoolBankAccountDto, userId: string) {
    const before = await this.load(id);
    const account = await this.prisma.schoolBankAccount.update({
      where: { id },
      data: {
        ...(dto.banque !== undefined ? { banque: dto.banque.trim() } : {}),
        ...(dto.titulaire !== undefined
          ? { titulaire: dto.titulaire.trim() }
          : {}),
        ...(dto.numero !== undefined ? { numero: dto.numero.trim() } : {}),
        ...(dto.instructions !== undefined
          ? { instructions: dto.instructions.trim() || null }
          : {}),
        ...(dto.actif !== undefined ? { actif: dto.actif } : {}),
      },
    });
    await this.audit.log({
      schoolId: before.schoolId,
      userId,
      action: 'SCHOOL_BANK_ACCOUNT_UPDATE',
      entite: 'SchoolBankAccount',
      entiteId: id,
      ancienneValeur: { banque: before.banque, actif: before.actif },
      nouvelleValeur: { banque: account.banque, actif: account.actif },
    });
    return account;
  }

  async remove(id: string, userId: string) {
    const account = await this.load(id);
    const used = await this.prisma.bankPaymentClaim.count({
      where: { compteId: id },
    });
    if (used > 0) {
      throw new ConflictException(
        pick({
          fr: 'Ce compte est cité par des déclarations de paiement : désactivez-le plutôt que de le supprimer.',
          en: 'This account is referenced by payment declarations: deactivate it instead of deleting it.',
        }),
      );
    }
    await this.prisma.schoolBankAccount.delete({ where: { id } });
    await this.audit.log({
      schoolId: account.schoolId,
      userId,
      action: 'SCHOOL_BANK_ACCOUNT_DELETE',
      entite: 'SchoolBankAccount',
      entiteId: id,
      ancienneValeur: { banque: account.banque },
    });
    return { id };
  }

  private async load(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const account = await this.prisma.schoolBankAccount.findFirst({
      where: { id, schoolId },
    });
    if (!account) {
      throw new NotFoundException(
        pick({ fr: 'Compte introuvable.', en: 'Account not found.' }),
      );
    }
    return account;
  }
}

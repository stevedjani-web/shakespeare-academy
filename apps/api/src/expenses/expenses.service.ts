import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { RejectExpenseDto } from './dto/reject-expense.dto';

const EXPENSE_INCLUDE = {
  effectuePar: { select: { id: true, nom: true, prenom: true } },
  approbateur: { select: { id: true, nom: true, prenom: true } },
};

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  async findAll(statut?: string, from?: string, to?: string) {
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.expense.findMany({
      where: {
        schoolId,
        statut: (statut as never) || undefined,
        dateDepense:
          from || to
            ? {
                gte: from ? new Date(from) : undefined,
                lt: to ? new Date(to) : undefined,
              }
            : undefined,
      },
      include: EXPENSE_INCLUDE,
      orderBy: { dateDepense: 'desc' },
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

  /** Toute sortie part EN_ATTENTE (D25, provisoire seuil = 0 : Direction valide systématiquement). */
  async create(dto: CreateExpenseDto, actingUserId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const expense = await this.prisma.expense.create({
      data: {
        schoolId,
        categorie: dto.categorie,
        montant: dto.montant,
        description: dto.description,
        dateDepense: dto.dateDepense ? new Date(dto.dateDepense) : undefined,
        effectueParId: actingUserId,
      },
      include: EXPENSE_INCLUDE,
    });

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

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        statut: 'APPROUVEE',
        approbateurId: actingUserId,
        dateDecision: new Date(),
      },
      include: EXPENSE_INCLUDE,
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'EXPENSE_APPROVE',
      entite: 'Expense',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: expense,
    });

    return expense;
  }

  async reject(id: string, dto: RejectExpenseDto, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.statut !== 'EN_ATTENTE') {
      throw new ConflictException(
        'Seule une sortie en attente peut être rejetée.',
      );
    }

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        statut: 'REJETEE',
        approbateurId: actingUserId,
        motifRejet: dto.motif,
        dateDecision: new Date(),
      },
      include: EXPENSE_INCLUDE,
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'EXPENSE_REJECT',
      entite: 'Expense',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: expense,
    });

    return expense;
  }
}

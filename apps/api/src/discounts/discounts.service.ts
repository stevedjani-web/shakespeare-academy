import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { RejectDiscountDto } from './dto/reject-discount.dto';

const DISCOUNT_INCLUDE = {
  invoiceLine: { include: { feeType: true, invoice: true } },
  auteur: { select: { id: true, nom: true, prenom: true } },
  approbateur: { select: { id: true, nom: true, prenom: true } },
};

@Injectable()
export class DiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  async findAll(statut?: string) {
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.discount.findMany({
      where: {
        statut: (statut as never) || undefined,
        invoiceLine: { invoice: { schoolId } },
      },
      include: DISCOUNT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const discount = await this.prisma.discount.findFirst({
      where: { id, invoiceLine: { invoice: { schoolId } } },
      include: DISCOUNT_INCLUDE,
    });
    if (!discount) {
      throw new NotFoundException('Remise introuvable.');
    }
    return discount;
  }

  /** Toute demande de remise part EN_ATTENTE (RG06) — aucun seuil d'auto-approbation (D17 : jamais inventé). */
  async create(dto: CreateDiscountDto, actingUserId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const line = await this.prisma.invoiceLine.findFirst({
      where: { id: dto.invoiceLineId, invoice: { schoolId } },
      include: { invoice: true },
    });
    if (!line) {
      throw new NotFoundException('Ligne de facture introuvable.');
    }
    if (line.invoice.statut === 'ANNULEE') {
      throw new ConflictException('Cette facture est annulée, aucune remise ne peut y être demandée.');
    }
    if (dto.type === 'POURCENTAGE' && dto.valeur > 100) {
      throw new BadRequestException('Un pourcentage de remise ne peut pas dépasser 100.');
    }

    const discount = await this.prisma.discount.create({
      data: {
        invoiceLineId: dto.invoiceLineId,
        type: dto.type,
        valeur: dto.valeur,
        motif: dto.motif,
        auteurId: actingUserId,
      },
      include: DISCOUNT_INCLUDE,
    });

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'DISCOUNT_REQUEST',
      entite: 'Discount',
      entiteId: discount.id,
      nouvelleValeur: discount,
    });

    return discount;
  }

  async approve(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.statut !== 'EN_ATTENTE') {
      throw new ConflictException('Seule une remise en attente peut être approuvée.');
    }
    // RG06 : la personne qui a demandé la remise ne l'approuve jamais elle-même, même si son rôle le permettrait.
    if (before.auteurId === actingUserId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas approuver votre propre demande de remise : un autre responsable doit la valider.',
      );
    }

    const discount = await this.prisma.discount.update({
      where: { id },
      data: { statut: 'APPROUVEE', approbateurId: actingUserId, dateDecision: new Date() },
      include: DISCOUNT_INCLUDE,
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'DISCOUNT_APPROVE',
      entite: 'Discount',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: discount,
    });

    return discount;
  }

  async reject(id: string, dto: RejectDiscountDto, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.statut !== 'EN_ATTENTE') {
      throw new ConflictException('Seule une remise en attente peut être rejetée.');
    }

    const discount = await this.prisma.discount.update({
      where: { id },
      data: {
        statut: 'REJETEE',
        approbateurId: actingUserId,
        motifRejet: dto.motifRejet,
        dateDecision: new Date(),
      },
      include: DISCOUNT_INCLUDE,
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'DISCOUNT_REJECT',
      entite: 'Discount',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: discount,
    });

    return discount;
  }
}

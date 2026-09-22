import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { CreateFeeTypeDto } from './dto/create-fee-type.dto';
import { UpdateFeeTypeDto } from './dto/update-fee-type.dto';

@Injectable()
export class FeeTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  async findAll() {
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.feeType.findMany({
      where: { schoolId },
      orderBy: { nom: 'asc' },
    });
  }

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const feeType = await this.prisma.feeType.findFirst({
      where: { id, schoolId },
    });
    if (!feeType) {
      throw new NotFoundException('Type de frais introuvable.');
    }
    return feeType;
  }

  async create(dto: CreateFeeTypeDto, actingUserId: string) {
    const schoolId = await this.schoolService.getDefaultId();

    const existing = await this.prisma.feeType.findFirst({
      where: { schoolId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException('Un type de frais avec ce code existe déjà.');
    }

    const feeType = await this.prisma.feeType.create({
      data: {
        schoolId,
        code: dto.code,
        nom: dto.nom,
        obligatoire: dto.obligatoire ?? true,
        avecTranches: dto.avecTranches ?? false,
        appliesTo: dto.appliesTo ?? 'TOUS',
      },
    });

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'FEE_TYPE_CREATE',
      entite: 'FeeType',
      entiteId: feeType.id,
      nouvelleValeur: feeType,
    });

    return feeType;
  }

  async update(id: string, dto: UpdateFeeTypeDto, actingUserId: string) {
    const before = await this.findOne(id);
    const feeType = await this.prisma.feeType.update({
      where: { id },
      data: dto,
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'FEE_TYPE_UPDATE',
      entite: 'FeeType',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: feeType,
    });

    return feeType;
  }
}

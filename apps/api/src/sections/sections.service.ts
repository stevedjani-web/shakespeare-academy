import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

@Injectable()
export class SectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  async findAll() {
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.section.findMany({
      where: { schoolId },
      orderBy: { nom: 'asc' },
    });
  }

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const section = await this.prisma.section.findFirst({
      where: { id, schoolId },
    });
    if (!section) {
      throw new NotFoundException('Section introuvable.');
    }
    return section;
  }

  async create(dto: CreateSectionDto, actingUserId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const existing = await this.prisma.section.findFirst({
      where: { schoolId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException('Une section avec ce code existe déjà.');
    }
    const section = await this.prisma.section.create({
      data: { ...dto, schoolId },
    });

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'SECTION_CREATE',
      entite: 'Section',
      entiteId: section.id,
      nouvelleValeur: section,
    });

    return section;
  }

  async update(id: string, dto: UpdateSectionDto, actingUserId: string) {
    const before = await this.findOne(id);
    const section = await this.prisma.section.update({
      where: { id },
      data: dto,
    });

    await this.auditService.log({
      schoolId: before.schoolId,
      userId: actingUserId,
      action: 'SECTION_UPDATE',
      entite: 'Section',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: section,
    });

    return section;
  }
}

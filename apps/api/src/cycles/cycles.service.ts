import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { SectionsService } from '../sections/sections.service';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { UpdateCycleDto } from './dto/update-cycle.dto';

@Injectable()
export class CyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
    private readonly sectionsService: SectionsService,
  ) {}

  async findAll(sectionId?: string) {
    return this.prisma.cycle.findMany({
      where: sectionId ? { sectionId } : undefined,
      orderBy: { ordre: 'asc' },
    });
  }

  async findOne(id: string) {
    const cycle = await this.prisma.cycle.findUnique({ where: { id } });
    if (!cycle) {
      throw new NotFoundException('Cycle introuvable.');
    }
    return cycle;
  }

  async create(dto: CreateCycleDto, actingUserId: string) {
    // Vérifie que la section appartient bien à l'établissement (R7-like scoping, cf. Elyon).
    await this.sectionsService.findOne(dto.sectionId);

    const existing = await this.prisma.cycle.findFirst({
      where: { sectionId: dto.sectionId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(
        'Un cycle avec ce code existe déjà pour cette section.',
      );
    }

    const cycle = await this.prisma.cycle.create({ data: dto });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'CYCLE_CREATE',
      entite: 'Cycle',
      entiteId: cycle.id,
      nouvelleValeur: cycle,
    });

    return cycle;
  }

  async update(id: string, dto: UpdateCycleDto, actingUserId: string) {
    const before = await this.findOne(id);
    const cycle = await this.prisma.cycle.update({ where: { id }, data: dto });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'CYCLE_UPDATE',
      entite: 'Cycle',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: cycle,
    });

    return cycle;
  }
}

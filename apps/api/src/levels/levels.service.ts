import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { CyclesService } from '../cycles/cycles.service';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';

@Injectable()
export class LevelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
    private readonly cyclesService: CyclesService,
  ) {}

  async findAll(cycleId?: string) {
    return this.prisma.level.findMany({
      where: cycleId ? { cycleId } : undefined,
      orderBy: { ordre: 'asc' },
    });
  }

  async findOne(id: string) {
    const level = await this.prisma.level.findUnique({ where: { id } });
    if (!level) {
      throw new NotFoundException('Niveau introuvable.');
    }
    return level;
  }

  async create(dto: CreateLevelDto, actingUserId: string) {
    await this.cyclesService.findOne(dto.cycleId);

    const existing = await this.prisma.level.findFirst({
      where: { cycleId: dto.cycleId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(
        'Un niveau avec ce code existe déjà pour ce cycle.',
      );
    }

    const level = await this.prisma.level.create({ data: dto });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'LEVEL_CREATE',
      entite: 'Level',
      entiteId: level.id,
      nouvelleValeur: level,
    });

    return level;
  }

  async update(id: string, dto: UpdateLevelDto, actingUserId: string) {
    const before = await this.findOne(id);
    const level = await this.prisma.level.update({ where: { id }, data: dto });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'LEVEL_UPDATE',
      entite: 'Level',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: level,
    });

    return level;
  }
}

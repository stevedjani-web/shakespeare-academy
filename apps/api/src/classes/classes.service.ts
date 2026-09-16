import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { LevelsService } from '../levels/levels.service';
import { AcademicYearsService } from '../academic-years/academic-years.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
    private readonly levelsService: LevelsService,
    private readonly academicYearsService: AcademicYearsService,
  ) {}

  async findAll(academicYearId?: string, levelId?: string) {
    return this.prisma.class.findMany({
      where: {
        academicYearId: academicYearId || undefined,
        levelId: levelId || undefined,
      },
      orderBy: { nom: 'asc' },
    });
  }

  async findOne(id: string) {
    const klass = await this.prisma.class.findUnique({ where: { id } });
    if (!klass) {
      throw new NotFoundException('Classe introuvable.');
    }
    return klass;
  }

  async create(dto: CreateClassDto, actingUserId: string) {
    await this.levelsService.findOne(dto.levelId);
    // Vérifie aussi que l'année scolaire appartient bien à l'établissement (cohérence R7-like).
    await this.academicYearsService.findOne(dto.academicYearId);

    const existing = await this.prisma.class.findFirst({
      where: {
        levelId: dto.levelId,
        academicYearId: dto.academicYearId,
        nom: dto.nom,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Une classe avec ce nom existe déjà pour ce niveau et cette année.',
      );
    }

    const klass = await this.prisma.class.create({ data: dto });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'CLASS_CREATE',
      entite: 'Class',
      entiteId: klass.id,
      nouvelleValeur: klass,
    });

    return klass;
  }

  async update(id: string, dto: UpdateClassDto, actingUserId: string) {
    const before = await this.findOne(id);
    const klass = await this.prisma.class.update({ where: { id }, data: dto });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'CLASS_UPDATE',
      entite: 'Class',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: klass,
    });

    return klass;
  }
}

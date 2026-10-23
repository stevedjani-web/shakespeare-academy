import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { normalize } from './pedagogy.util';
import {
  CreateClassCombinationDto,
  UpdateClassCombinationDto,
} from './dto/pedagogy.dto';

/**
 * Classes combinées : plusieurs classes (ex. GS et CP) suivent ensemble un même cours avec un seul enseignant et une
 * seule salle. L'emploi du temps n'y voit alors plus un double emploi pour la même matière au même moment.
 */
@Injectable()
export class ClassCombinationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
  ) {}

  private async log(
    userId: string,
    action: string,
    entiteId: string,
    ancienneValeur?: unknown,
    nouvelleValeur?: unknown,
  ) {
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action,
      entite: 'ClassCombination',
      entiteId,
      ancienneValeur,
      nouvelleValeur,
    });
  }

  async list(academicYearId?: string) {
    const rows = await this.prisma.classCombination.findMany({
      where: academicYearId ? { academicYearId } : {},
      orderBy: [{ academicYearId: 'asc' }, { nom: 'asc' }],
      include: {
        classes: { select: { id: true, nom: true }, orderBy: { nom: 'asc' } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      nom: c.nom,
      academicYearId: c.academicYearId,
      classes: c.classes,
    }));
  }

  private async assertYearOpen(academicYearId: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
    });
    if (!year) throw new NotFoundException('Année scolaire introuvable.');
    if (year.statut === 'CLOTUREE') {
      throw new ConflictException('Cette année scolaire est clôturée.');
    }
  }

  private async assertClasses(
    classIds: string[],
    academicYearId: string,
    combinationId?: string,
  ) {
    const classes = await this.prisma.class.findMany({
      where: { id: { in: classIds } },
    });
    if (classes.length !== classIds.length) {
      throw new NotFoundException('Classe introuvable.');
    }
    if (classes.some((c) => c.academicYearId !== academicYearId)) {
      throw new BadRequestException(
        'Toutes les classes doivent appartenir à l’année scolaire du groupe.',
      );
    }
    const taken = classes.find(
      (c) => c.combinationId && c.combinationId !== combinationId,
    );
    if (taken) {
      throw new ConflictException(
        `La classe « ${taken.nom} » fait déjà partie d’un autre groupe de classes combinées.`,
      );
    }
  }

  private async assertNameFree(
    nom: string,
    academicYearId: string,
    excludeId?: string,
  ) {
    const all = await this.prisma.classCombination.findMany({
      where: { academicYearId },
    });
    if (
      all.some((c) => c.id !== excludeId && normalize(c.nom) === normalize(nom))
    ) {
      throw new ConflictException(
        `Un groupe « ${nom} » existe déjà cette année.`,
      );
    }
  }

  async create(dto: CreateClassCombinationDto, userId: string) {
    const schoolId = await this.school.getDefaultId();
    await this.assertYearOpen(dto.academicYearId);
    const nom = dto.nom.trim();
    await this.assertNameFree(nom, dto.academicYearId);
    await this.assertClasses(dto.classIds, dto.academicYearId);
    const created = await this.prisma.$transaction(async (tx) => {
      const c = await tx.classCombination.create({
        data: { schoolId, academicYearId: dto.academicYearId, nom },
      });
      await tx.class.updateMany({
        where: { id: { in: dto.classIds } },
        data: { combinationId: c.id },
      });
      return c;
    });
    await this.log(userId, 'CLASS_COMBINATION_CREATE', created.id, null, {
      nom,
      classIds: dto.classIds,
    });
    return this.one(created.id);
  }

  private async one(id: string) {
    const c = await this.prisma.classCombination.findUnique({
      where: { id },
      include: {
        classes: { select: { id: true, nom: true }, orderBy: { nom: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException('Groupe de classes introuvable.');
    return {
      id: c.id,
      nom: c.nom,
      academicYearId: c.academicYearId,
      classes: c.classes,
    };
  }

  async update(id: string, dto: UpdateClassCombinationDto, userId: string) {
    const before = await this.one(id);
    await this.assertYearOpen(before.academicYearId);
    const nom = dto.nom?.trim() ?? before.nom;
    if (dto.nom !== undefined) {
      await this.assertNameFree(nom, before.academicYearId, id);
    }
    const classIds = dto.classIds ?? before.classes.map((c) => c.id);
    if (dto.classIds) {
      await this.assertClasses(classIds, before.academicYearId, id);
    }
    await this.prisma.$transaction([
      this.prisma.classCombination.update({ where: { id }, data: { nom } }),
      this.prisma.class.updateMany({
        where: { combinationId: id, id: { notIn: classIds } },
        data: { combinationId: null },
      }),
      this.prisma.class.updateMany({
        where: { id: { in: classIds } },
        data: { combinationId: id },
      }),
    ]);
    await this.log(
      userId,
      'CLASS_COMBINATION_UPDATE',
      id,
      { nom: before.nom, classIds: before.classes.map((c) => c.id) },
      { nom, classIds },
    );
    return this.one(id);
  }

  async remove(id: string, userId: string) {
    const before = await this.one(id);
    await this.assertYearOpen(before.academicYearId);
    await this.prisma.$transaction([
      this.prisma.class.updateMany({
        where: { combinationId: id },
        data: { combinationId: null },
      }),
      this.prisma.classCombination.delete({ where: { id } }),
    ]);
    await this.log(
      userId,
      'CLASS_COMBINATION_DELETE',
      id,
      { nom: before.nom, classIds: before.classes.map((c) => c.id) },
      null,
    );
    return { id };
  }
}

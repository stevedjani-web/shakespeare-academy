import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { normalize } from './pedagogy.util';
import { CreateTimeGridDto, UpdateTimeGridDto } from './dto/pedagogy.dto';

/**
 * Grilles horaires nommées : un rythme propre à certains niveaux (ex. « Maternelle » et « Primaire », la grande
 * section de la maternelle suivant le rythme du primaire). Un niveau sans grille nommée garde celle de sa section,
 * sinon la grille commune.
 */
@Injectable()
export class TimeGridsService {
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
      entite: 'TimeGrid',
      entiteId,
      ancienneValeur,
      nouvelleValeur,
    });
  }

  async list() {
    const grids = await this.prisma.timeGrid.findMany({
      orderBy: { nom: 'asc' },
      include: {
        levels: { select: { id: true, nom: true }, orderBy: { nom: 'asc' } },
        _count: { select: { slots: true } },
      },
    });
    return grids.map((g) => ({
      id: g.id,
      nom: g.nom,
      creneaux: g._count.slots,
      niveaux: g.levels,
    }));
  }

  private async assertNameFree(nom: string, excludeId?: string) {
    const all = await this.prisma.timeGrid.findMany();
    const clash = all.find(
      (g) => g.id !== excludeId && normalize(g.nom) === normalize(nom),
    );
    if (clash) {
      throw new ConflictException(`Une grille « ${clash.nom} » existe déjà.`);
    }
  }

  /** Un niveau change de grille : refusé tant qu'un brouillon d'emploi du temps a des séances dans ses classes. */
  private async assertLevelsFree(levelIds: string[], gridId: string | null) {
    if (levelIds.length === 0) return;
    const levels = await this.prisma.level.findMany({
      where: { id: { in: levelIds } },
    });
    if (levels.length !== levelIds.length) {
      throw new NotFoundException('Niveau introuvable.');
    }
    const changing = levels.filter((l) => l.gridId !== gridId);
    if (changing.length === 0) return;
    const inDraft = await this.prisma.timetableEntry.count({
      where: {
        class: { levelId: { in: changing.map((l) => l.id) } },
        timetable: { statut: 'BROUILLON' },
      },
    });
    if (inDraft > 0) {
      throw new ConflictException(
        'Un brouillon d’emploi du temps contient déjà des séances pour ces niveaux : retirez-les avant de changer leur grille horaire.',
      );
    }
  }

  async create(dto: CreateTimeGridDto, userId: string) {
    const schoolId = await this.school.getDefaultId();
    const nom = dto.nom.trim();
    await this.assertNameFree(nom);
    const levelIds = dto.levelIds ?? [];
    await this.assertLevelsFree(levelIds, null);

    let template: {
      libelle: string;
      heureDebut: string;
      heureFin: string;
      type: 'COURS' | 'PAUSE';
    }[] = [];
    if (dto.copierDe) {
      if (dto.copierDe !== 'COMMUNE') {
        const exists = await this.prisma.timeGrid.findUnique({
          where: { id: dto.copierDe },
        });
        if (!exists) {
          throw new NotFoundException('Grille à copier introuvable.');
        }
      }
      const source = await this.prisma.timeSlot.findMany({
        where:
          dto.copierDe === 'COMMUNE'
            ? { sectionId: null, gridId: null }
            : { gridId: dto.copierDe },
        orderBy: { heureDebut: 'asc' },
      });
      template = source.map((s) => ({
        libelle: s.libelle,
        heureDebut: s.heureDebut,
        heureFin: s.heureFin,
        type: s.type,
      }));
    }

    const grid = await this.prisma.$transaction(async (tx) => {
      const created = await tx.timeGrid.create({ data: { schoolId, nom } });
      if (template.length > 0) {
        await tx.timeSlot.createMany({
          data: template.map((t) => ({ ...t, schoolId, gridId: created.id })),
        });
      }
      if (levelIds.length > 0) {
        await tx.level.updateMany({
          where: { id: { in: levelIds } },
          data: { gridId: created.id },
        });
      }
      return created;
    });
    await this.log(userId, 'TIME_GRID_CREATE', grid.id, null, {
      nom,
      levelIds,
      creneauxCopies: template.length,
    });
    return this.one(grid.id);
  }

  private async one(id: string) {
    const all = await this.list();
    const grid = all.find((g) => g.id === id);
    if (!grid) throw new NotFoundException('Grille horaire introuvable.');
    return grid;
  }

  async update(id: string, dto: UpdateTimeGridDto, userId: string) {
    const before = await this.prisma.timeGrid.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Grille horaire introuvable.');
    if (dto.nom !== undefined) {
      const nom = dto.nom.trim();
      await this.assertNameFree(nom, id);
      await this.prisma.timeGrid.update({ where: { id }, data: { nom } });
      await this.log(
        userId,
        'TIME_GRID_UPDATE',
        id,
        { nom: before.nom },
        { nom },
      );
    }
    return this.one(id);
  }

  /** Remplace la liste des niveaux qui suivent cette grille (les autres retombent sur leur section ou la grille commune). */
  async setLevels(id: string, levelIds: string[], userId: string) {
    const grid = await this.prisma.timeGrid.findUnique({
      where: { id },
      include: { levels: { select: { id: true } } },
    });
    if (!grid) throw new NotFoundException('Grille horaire introuvable.');
    await this.assertLevelsFree(levelIds, id);
    const previous = grid.levels.map((l) => l.id);
    const removed = previous.filter((l) => !levelIds.includes(l));
    await this.assertLevelsFree(removed, null);
    await this.prisma.$transaction([
      this.prisma.level.updateMany({
        where: { id: { in: removed } },
        data: { gridId: null },
      }),
      this.prisma.level.updateMany({
        where: { id: { in: levelIds } },
        data: { gridId: id },
      }),
    ]);
    await this.log(
      userId,
      'TIME_GRID_LEVELS',
      id,
      { levelIds: previous },
      { levelIds },
    );
    return this.one(id);
  }

  async remove(id: string, userId: string) {
    const grid = await this.prisma.timeGrid.findUnique({
      where: { id },
      include: { _count: { select: { levels: true } } },
    });
    if (!grid) throw new NotFoundException('Grille horaire introuvable.');
    if (grid._count.levels > 0) {
      throw new ConflictException(
        'Des niveaux suivent encore cette grille : retirez-les d’abord.',
      );
    }
    const used = await this.prisma.timetableEntry.count({
      where: { timeSlot: { gridId: id } },
    });
    if (used > 0) {
      throw new ConflictException(
        'Les créneaux de cette grille sont utilisés dans un emploi du temps : elle ne peut pas être supprimée.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.timeSlot.deleteMany({ where: { gridId: id } }),
      this.prisma.timeGrid.delete({ where: { id } }),
    ]);
    await this.log(userId, 'TIME_GRID_DELETE', id, { nom: grid.nom }, null);
    return { id };
  }
}

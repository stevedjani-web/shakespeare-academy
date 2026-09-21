import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { UpdateGradeSettingsDto } from './dto/grades.dto';

/**
 * Paramètres du Lot 15, tous saisis par la Direction, jamais codés : barème par défaut, moyenne de passage (vide =
 * aucune mention), affichage du rang aux parents, tranches de lettres (vides = aucune lettre), lettres par section.
 */
@Injectable()
export class GradeSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
  ) {}

  async get() {
    const [school, bands, sections] = await Promise.all([
      this.prisma.school.findFirstOrThrow({
        select: {
          baremeDefaut: true,
          moyennePassage: true,
          bulletinAfficheRang: true,
        },
      }),
      this.prisma.gradeBand.findMany(),
      this.prisma.section.findMany({ orderBy: { nom: 'asc' } }),
    ]);
    return {
      baremeDefaut: school.baremeDefaut,
      moyennePassage:
        school.moyennePassage === null ? null : Number(school.moyennePassage),
      bulletinAfficheRang: school.bulletinAfficheRang,
      bands: bands
        .map((b) => ({ lettre: b.lettre, minimum: Number(b.minimum) }))
        .sort((a, b) => b.minimum - a.minimum),
      sections: sections.map((s) => ({
        id: s.id,
        nom: s.nom,
        affichageLettres: s.affichageLettres,
      })),
    };
  }

  async update(dto: UpdateGradeSettingsDto, userId: string) {
    const before = await this.get();
    if (dto.bands) {
      const letters = dto.bands.map((b) => b.lettre.trim().toUpperCase());
      if (new Set(letters).size !== letters.length) {
        throw new BadRequestException(
          'Une lettre figure deux fois dans les tranches.',
        );
      }
      const minimums = dto.bands.map((b) => b.minimum);
      if (new Set(minimums).size !== minimums.length) {
        throw new BadRequestException('Deux tranches ont le même minimum.');
      }
    }
    if (dto.sections) {
      const ids = await this.prisma.section.findMany({
        where: { id: { in: dto.sections.map((s) => s.sectionId) } },
        select: { id: true },
      });
      if (ids.length !== new Set(dto.sections.map((s) => s.sectionId)).size) {
        throw new NotFoundException('Une section est introuvable.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const school = await tx.school.findFirstOrThrow({ select: { id: true } });
      await tx.school.update({
        where: { id: school.id },
        data: {
          baremeDefaut: dto.baremeDefaut,
          // `null` efface la moyenne de passage ; absent la laisse inchangée.
          moyennePassage: dto.moyennePassage,
          bulletinAfficheRang: dto.bulletinAfficheRang,
        },
      });
      if (dto.bands) {
        await tx.gradeBand.deleteMany();
        if (dto.bands.length > 0) {
          await tx.gradeBand.createMany({
            data: dto.bands.map((b) => ({
              lettre: b.lettre.trim().toUpperCase(),
              minimum: b.minimum,
            })),
          });
        }
      }
      for (const s of dto.sections ?? []) {
        await tx.section.update({
          where: { id: s.sectionId },
          data: { affichageLettres: s.affichageLettres },
        });
      }
    });

    const after = await this.get();
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action: 'GRADE_SETTINGS_UPDATE',
      entite: 'School',
      entiteId: await this.school.getDefaultId(),
      ancienneValeur: before,
      nouvelleValeur: after,
    });
    return after;
  }
}

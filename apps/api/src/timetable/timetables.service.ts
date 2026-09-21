import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateEntryDto,
  CreateTimetableDto,
  PublishTimetableDto,
  UpdateEntryDto,
} from './dto/timetable.dto';
import { isoDay, overlaps, toDateOnly } from './timetable.util';

export const ENTRY_INCLUDE = {
  class: true,
  subject: true,
  teacher: true,
  room: true,
  timeSlot: true,
} as const;

export type EntryWithRelations = Prisma.TimetableEntryGetPayload<{
  include: typeof ENTRY_INCLUDE;
}>;

const DAY_LABELS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Versions d'emploi du temps et séances hebdomadaires (RV01, RV02, RV03). */
@Injectable()
export class TimetablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
    private readonly notifications: NotificationsService,
  ) {}

  private async log(
    userId: string,
    action: string,
    entite: string,
    entiteId: string,
    ancienneValeur?: unknown,
    nouvelleValeur?: unknown,
  ) {
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action,
      entite,
      entiteId,
      ancienneValeur,
      nouvelleValeur,
    });
  }

  // ------------------------------------------------------------------ Versions

  // Un brouillon est un travail en cours : seuls ceux qui gèrent le référentiel le voient.
  list(academicYearId?: string, canSeeDraft = true) {
    return this.prisma.timetable.findMany({
      where: {
        academicYearId: academicYearId || undefined,
        statut: canSeeDraft ? undefined : { not: 'BROUILLON' },
      },
      orderBy: [{ academicYearId: 'asc' }, { numero: 'desc' }],
      include: { _count: { select: { entries: true } } },
    });
  }

  async findOne(id: string) {
    const timetable = await this.prisma.timetable.findUnique({
      where: { id },
      include: { _count: { select: { entries: true } } },
    });
    if (!timetable) {
      throw new NotFoundException('Emploi du temps introuvable.');
    }
    return timetable;
  }

  async findVisible(id: string, canSeeDraft: boolean) {
    const timetable = await this.findOne(id);
    if (timetable.statut === 'BROUILLON' && !canSeeDraft) {
      throw new NotFoundException('Emploi du temps introuvable.');
    }
    return timetable;
  }

  private async editableYear(academicYearId: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
    });
    if (!year) {
      throw new NotFoundException('Année scolaire introuvable.');
    }
    if (year.statut === 'CLOTUREE') {
      throw new ConflictException(
        'Cette année scolaire est clôturée : son emploi du temps ne peut plus être modifié.',
      );
    }
    return year;
  }

  private async draft(id: string) {
    const timetable = await this.findOne(id);
    if (timetable.statut !== 'BROUILLON') {
      throw new ConflictException(
        'Cette version est publiée : elle ne se modifie plus. Créez une nouvelle version pour changer l’emploi du temps.',
      );
    }
    return timetable;
  }

  /**
   * Nouvelle version (brouillon). Par défaut on repart de la dernière version publiée pour ne pas tout
   * ressaisir ; `vide` permet de repartir de zéro. Un seul brouillon à la fois par année.
   */
  async create(dto: CreateTimetableDto, userId: string) {
    const year = await this.editableYear(dto.academicYearId);
    const existingDraft = await this.prisma.timetable.findFirst({
      where: { academicYearId: year.id, statut: 'BROUILLON' },
    });
    if (existingDraft) {
      throw new ConflictException(
        `Un brouillon (version ${existingDraft.numero}) existe déjà pour cette année : terminez-le ou supprimez-le d'abord.`,
      );
    }

    let source: { id: string } | null = null;
    if (!dto.vide) {
      if (dto.copyFromId) {
        source = await this.prisma.timetable.findFirst({
          where: { id: dto.copyFromId, academicYearId: year.id },
        });
        if (!source) {
          throw new NotFoundException('La version à copier est introuvable pour cette année.');
        }
      } else {
        source = await this.prisma.timetable.findFirst({
          where: { academicYearId: year.id, statut: 'PUBLIE' },
        });
      }
    }

    const last = await this.prisma.timetable.findFirst({
      where: { academicYearId: year.id },
      orderBy: { numero: 'desc' },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const timetable = await tx.timetable.create({
        data: { academicYearId: year.id, numero: (last?.numero ?? 0) + 1 },
      });
      if (source) {
        const entries = await tx.timetableEntry.findMany({ where: { timetableId: source.id } });
        if (entries.length > 0) {
          await tx.timetableEntry.createMany({
            data: entries.map((e) => ({
              timetableId: timetable.id,
              classId: e.classId,
              subjectId: e.subjectId,
              teacherId: e.teacherId,
              roomId: e.roomId,
              timeSlotId: e.timeSlotId,
              jourSemaine: e.jourSemaine,
              heureDebut: e.heureDebut,
              heureFin: e.heureFin,
            })),
          });
        }
      }
      return timetable;
    });
    await this.log(userId, 'TIMETABLE_CREATE', 'Timetable', created.id, null, {
      ...created,
      copieDe: source?.id ?? null,
    });
    return created;
  }

  async remove(id: string, userId: string) {
    const timetable = await this.draft(id);
    await this.prisma.$transaction([
      this.prisma.timetableEntry.deleteMany({ where: { timetableId: id } }),
      this.prisma.timetable.delete({ where: { id } }),
    ]);
    await this.log(userId, 'TIMETABLE_DELETE', 'Timetable', id, timetable, null);
    return { id };
  }

  // ------------------------------------------------------------------- Séances

  listEntries(timetableId: string, filters: { classId?: string; teacherId?: string; roomId?: string }) {
    return this.prisma.timetableEntry.findMany({
      where: {
        timetableId,
        classId: filters.classId || undefined,
        teacherId: filters.teacherId || undefined,
        roomId: filters.roomId || undefined,
      },
      include: ENTRY_INCLUDE,
      orderBy: [{ jourSemaine: 'asc' }, { heureDebut: 'asc' }],
    });
  }

  /** Vérifie une séance et en déduit l'enseignant (celui de l'affectation) et les heures (celles du créneau). */
  private async prepareEntry(
    timetable: { academicYearId: string },
    input: { classId: string; subjectId: string; timeSlotId: string; jourSemaine: number; roomId: string },
  ) {
    const klass = await this.prisma.class.findUnique({
      where: { id: input.classId },
      include: { level: { include: { cycle: true } } },
    });
    if (!klass) {
      throw new NotFoundException('Classe introuvable.');
    }
    if (klass.academicYearId !== timetable.academicYearId) {
      throw new UnprocessableEntityException(
        'Cette classe n’appartient pas à l’année scolaire de cet emploi du temps.',
      );
    }

    const assignment = await this.prisma.teachingAssignment.findUnique({
      where: { classId_subjectId: { classId: klass.id, subjectId: input.subjectId } },
      include: { teacher: true, subject: true },
    });
    if (!assignment) {
      throw new UnprocessableEntityException(
        'Aucun enseignant n’est affecté à cette matière dans cette classe. Faites d’abord l’affectation dans « Vie scolaire ».',
      );
    }
    if (assignment.teacher.statut !== 'ACTIF') {
      throw new ConflictException(
        `${assignment.teacher.prenom} ${assignment.teacher.nom} est inactif : changez l'affectation ou réactivez l'enseignant.`,
      );
    }

    const slot = await this.prisma.timeSlot.findUnique({ where: { id: input.timeSlotId } });
    if (!slot) {
      throw new NotFoundException('Créneau introuvable.');
    }
    if (slot.type !== 'COURS') {
      throw new UnprocessableEntityException('Ce créneau est une pause : on n’y place pas de cours.');
    }
    const sectionId = klass.level.cycle.sectionId;
    const ownGrid = await this.prisma.timeSlot.count({ where: { sectionId } });
    const inGrid = ownGrid > 0 ? slot.sectionId === sectionId : slot.sectionId === null;
    if (!inGrid) {
      throw new UnprocessableEntityException(
        'Ce créneau n’appartient pas à la grille horaire de la section de cette classe.',
      );
    }

    const school = await this.prisma.school.findFirstOrThrow({ select: { joursClasse: true } });
    if (!school.joursClasse.includes(input.jourSemaine)) {
      throw new UnprocessableEntityException(
        `Le ${DAY_LABELS[input.jourSemaine]} n’est pas un jour de classe.`,
      );
    }

    const room = await this.prisma.room.findUnique({ where: { id: input.roomId } });
    if (!room) {
      throw new NotFoundException('Salle introuvable.');
    }
    if (!room.actif) {
      throw new ConflictException('Cette salle est désactivée.');
    }

    return { klass, assignment, slot, room };
  }

  private describe(e: EntryWithRelations): string {
    return `${e.class.nom}, ${e.subject.nom}, ${DAY_LABELS[e.jourSemaine]} ${e.heureDebut} - ${e.heureFin}`;
  }

  /** Refuse une séance qui met la classe, l'enseignant ou la salle en double emploi (RV02). */
  private async assertNoConflict(
    timetableId: string,
    x: { jourSemaine: number; heureDebut: string; heureFin: string; classId: string; teacherId: string; roomId: string },
    excludeId?: string,
  ) {
    const sameDay = await this.prisma.timetableEntry.findMany({
      where: { timetableId, jourSemaine: x.jourSemaine, id: excludeId ? { not: excludeId } : undefined },
      include: ENTRY_INCLUDE,
    });
    for (const e of sameDay) {
      if (!overlaps(x.heureDebut, x.heureFin, e.heureDebut, e.heureFin)) continue;
      if (e.classId === x.classId) {
        throw new ConflictException(`Cette classe a déjà cours à ce moment : ${this.describe(e)}.`);
      }
      if (e.teacherId === x.teacherId) {
        throw new ConflictException(
          `L'enseignant ${e.teacher.prenom} ${e.teacher.nom} a déjà cours à ce moment : ${this.describe(e)}.`,
        );
      }
      if (e.roomId === x.roomId) {
        throw new ConflictException(`La salle ${e.room.nom} est déjà occupée à ce moment : ${this.describe(e)}.`);
      }
    }
  }

  async createEntry(timetableId: string, dto: CreateEntryDto, userId: string) {
    const timetable = await this.draft(timetableId);
    const { assignment, slot } = await this.prepareEntry(timetable, dto);
    await this.assertNoConflict(timetableId, {
      jourSemaine: dto.jourSemaine,
      heureDebut: slot.heureDebut,
      heureFin: slot.heureFin,
      classId: dto.classId,
      teacherId: assignment.teacherId,
      roomId: dto.roomId,
    });
    const entry = await this.prisma.timetableEntry.create({
      data: {
        timetableId,
        classId: dto.classId,
        subjectId: dto.subjectId,
        teacherId: assignment.teacherId,
        roomId: dto.roomId,
        timeSlotId: slot.id,
        jourSemaine: dto.jourSemaine,
        heureDebut: slot.heureDebut,
        heureFin: slot.heureFin,
      },
      include: ENTRY_INCLUDE,
    });
    await this.log(userId, 'TIMETABLE_ENTRY_CREATE', 'TimetableEntry', entry.id, null, entry);
    return entry;
  }

  private async draftEntry(id: string) {
    const entry = await this.prisma.timetableEntry.findUnique({
      where: { id },
      include: { ...ENTRY_INCLUDE, timetable: true },
    });
    if (!entry) {
      throw new NotFoundException('Séance introuvable.');
    }
    if (entry.timetable.statut !== 'BROUILLON') {
      throw new ConflictException(
        'Cette séance fait partie d’une version publiée : elle ne se modifie plus. Créez une nouvelle version, ou utilisez un changement ponctuel.',
      );
    }
    return entry;
  }

  async updateEntry(id: string, dto: UpdateEntryDto, userId: string) {
    const before = await this.draftEntry(id);
    const merged = {
      classId: before.classId,
      subjectId: dto.subjectId ?? before.subjectId,
      timeSlotId: dto.timeSlotId ?? before.timeSlotId,
      jourSemaine: dto.jourSemaine ?? before.jourSemaine,
      roomId: dto.roomId ?? before.roomId,
    };
    const { assignment, slot } = await this.prepareEntry(before.timetable, merged);
    await this.assertNoConflict(
      before.timetableId,
      {
        jourSemaine: merged.jourSemaine,
        heureDebut: slot.heureDebut,
        heureFin: slot.heureFin,
        classId: merged.classId,
        teacherId: assignment.teacherId,
        roomId: merged.roomId,
      },
      id,
    );
    const entry = await this.prisma.timetableEntry.update({
      where: { id },
      data: {
        subjectId: merged.subjectId,
        teacherId: assignment.teacherId,
        roomId: merged.roomId,
        timeSlotId: slot.id,
        jourSemaine: merged.jourSemaine,
        heureDebut: slot.heureDebut,
        heureFin: slot.heureFin,
      },
      include: ENTRY_INCLUDE,
    });
    await this.log(userId, 'TIMETABLE_ENTRY_UPDATE', 'TimetableEntry', id, before, entry);
    return entry;
  }

  async deleteEntry(id: string, userId: string) {
    const before = await this.draftEntry(id);
    await this.prisma.timetableEntry.delete({ where: { id } });
    await this.log(userId, 'TIMETABLE_ENTRY_DELETE', 'TimetableEntry', id, before, null);
    return { id };
  }

  /**
   * Remet à jour les enseignants d'un brouillon d'après les affectations actuelles (par exemple après
   * un changement d'enseignant). Une séance qui créerait un conflit ou qui n'a plus d'affectation est
   * signalée sans être modifiée.
   */
  async resync(id: string, userId: string) {
    await this.draft(id);
    const entries = await this.prisma.timetableEntry.findMany({
      where: { timetableId: id },
      include: ENTRY_INCLUDE,
    });
    let misAJour = 0;
    const problemes: string[] = [];
    for (const e of entries) {
      const assignment = await this.prisma.teachingAssignment.findUnique({
        where: { classId_subjectId: { classId: e.classId, subjectId: e.subjectId } },
      });
      if (!assignment) {
        problemes.push(`Plus d'affectation pour ${this.describe(e)}.`);
        continue;
      }
      if (assignment.teacherId === e.teacherId) continue;
      try {
        await this.assertNoConflict(
          id,
          {
            jourSemaine: e.jourSemaine,
            heureDebut: e.heureDebut,
            heureFin: e.heureFin,
            classId: e.classId,
            teacherId: assignment.teacherId,
            roomId: e.roomId,
          },
          e.id,
        );
      } catch (err) {
        problemes.push(`${this.describe(e)} : ${(err as Error).message}`);
        continue;
      }
      await this.prisma.timetableEntry.update({ where: { id: e.id }, data: { teacherId: assignment.teacherId } });
      misAJour += 1;
    }
    await this.log(userId, 'TIMETABLE_RESYNC', 'Timetable', id, null, { misAJour, problemes: problemes.length });
    return { misAJour, problemes };
  }

  // ---------------------------------------------------------------- Publication

  /**
   * Publie un brouillon (RV03) : il devient la version en vigueur à partir de `dateEffet`, la version
   * publiée précédente est archivée. Tout est revérifié : un conflit (RV02) ou une incohérence avec
   * les affectations bloque la publication.
   */
  async publish(id: string, dto: PublishTimetableDto, userId: string) {
    const timetable = await this.prisma.timetable.findUnique({
      where: { id },
      include: { academicYear: true, entries: { include: ENTRY_INCLUDE } },
    });
    if (!timetable) {
      throw new NotFoundException('Emploi du temps introuvable.');
    }
    if (timetable.statut !== 'BROUILLON') {
      throw new ConflictException('Cette version est déjà publiée.');
    }
    await this.editableYear(timetable.academicYearId);
    if (timetable.entries.length === 0) {
      throw new UnprocessableEntityException('Cet emploi du temps est vide : ajoutez au moins une séance.');
    }

    const year = timetable.academicYear;
    if (dto.dateEffet < isoDay(year.dateDebut) || dto.dateEffet > isoDay(year.dateFin)) {
      throw new UnprocessableEntityException(
        `La date d'effet doit être dans l'année scolaire ${year.libelle} (${isoDay(year.dateDebut)} au ${isoDay(year.dateFin)}).`,
      );
    }
    const previous = await this.prisma.timetable.findFirst({
      where: { academicYearId: year.id, statut: 'PUBLIE' },
    });
    if (previous?.dateEffet && dto.dateEffet <= isoDay(previous.dateEffet)) {
      throw new UnprocessableEntityException(
        `La date d'effet doit être postérieure à celle de la version en vigueur (${isoDay(previous.dateEffet)}).`,
      );
    }

    const problemes = await this.verify(timetable.entries);
    if (problemes.length > 0) {
      const shown = problemes.slice(0, 3).join(' ');
      throw new UnprocessableEntityException({
        message: `Publication impossible : ${problemes.length} problème(s). ${shown}${problemes.length > 3 ? ' (…)' : ''}`,
        problemes,
      });
    }

    const published = await this.prisma.$transaction(async (tx) => {
      if (previous) {
        await tx.timetable.update({ where: { id: previous.id }, data: { statut: 'ARCHIVE' } });
      }
      return tx.timetable.update({
        where: { id },
        data: {
          statut: 'PUBLIE',
          dateEffet: toDateOnly(dto.dateEffet),
          datePublication: new Date(),
          publieParId: userId,
        },
      });
    });
    await this.log(userId, 'TIMETABLE_PUBLISH', 'Timetable', id, timetable.statut, {
      ...published,
      remplace: previous?.id ?? null,
    });
    // Lot 12 : les responsables des élèves inscrits sont prévenus (regroupé, sans détail sensible).
    await this.notifications.notifyTimetablePublished(timetable.academicYearId, dto.dateEffet);
    return published;
  }

  /** Liste tous les problèmes bloquants d'un ensemble de séances (conflits, affectations, jours, ressources). */
  async verify(entries: EntryWithRelations[]): Promise<string[]> {
    const problemes: string[] = [];
    const school = await this.prisma.school.findFirstOrThrow({ select: { joursClasse: true } });
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { classId: { in: [...new Set(entries.map((e) => e.classId))] } },
    });

    for (const e of entries) {
      const who = this.describe(e);
      const assignment = assignments.find((a) => a.classId === e.classId && a.subjectId === e.subjectId);
      if (!assignment) {
        problemes.push(`${who} : plus aucun enseignant n'est affecté à cette matière.`);
      } else if (assignment.teacherId !== e.teacherId) {
        problemes.push(`${who} : l'enseignant a changé dans l'affectation (utilisez « Mettre à jour les enseignants »).`);
      }
      if (e.teacher.statut !== 'ACTIF') {
        problemes.push(`${who} : l'enseignant ${e.teacher.prenom} ${e.teacher.nom} est inactif.`);
      }
      if (!e.room.actif) {
        problemes.push(`${who} : la salle ${e.room.nom} est désactivée.`);
      }
      if (!school.joursClasse.includes(e.jourSemaine)) {
        problemes.push(`${who} : ce jour n'est plus un jour de classe.`);
      }
    }

    // Double emploi (RV02) : chaque paire de séances du même jour qui se chevauchent.
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        if (a.jourSemaine !== b.jourSemaine) continue;
        if (!overlaps(a.heureDebut, a.heureFin, b.heureDebut, b.heureFin)) continue;
        if (a.classId === b.classId) {
          problemes.push(`Conflit de classe (${a.class.nom}) : ${this.describe(a)} et ${this.describe(b)}.`);
        }
        if (a.teacherId === b.teacherId) {
          problemes.push(
            `Conflit d'enseignant (${a.teacher.prenom} ${a.teacher.nom}) : ${this.describe(a)} et ${this.describe(b)}.`,
          );
        }
        if (a.roomId === b.roomId) {
          problemes.push(`Conflit de salle (${a.room.nom}) : ${this.describe(a)} et ${this.describe(b)}.`);
        }
      }
    }
    return problemes;
  }

  /** Vérification à la demande d'un brouillon, sans le publier. */
  async check(id: string) {
    await this.findOne(id);
    const entries = await this.prisma.timetableEntry.findMany({
      where: { timetableId: id },
      include: ENTRY_INCLUDE,
    });
    const problemes = await this.verify(entries);
    return { pret: entries.length > 0 && problemes.length === 0, seances: entries.length, problemes };
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateExceptionDto } from './dto/timetable.dto';
import { ENTRY_INCLUDE } from './timetables.service';
import { addDays, isoDay, mondayOf, overlaps, toDateOnly, weekdayOf } from './timetable.util';

export interface OccurrenceFilters {
  classId?: string;
  teacherId?: string;
  roomId?: string;
}

const EXCEPTION_INCLUDE = { replacementTeacher: true, room: true } as const;

/**
 * Emploi du temps « réel » d'un jour donné : la version en vigueur ce jour-là (RV03), à laquelle
 * s'appliquent les changements ponctuels. Ces derniers ne modifient jamais les séances : l'historique
 * d'une version publiée reste donc toujours lisible tel qu'il a été publié.
 */
@Injectable()
export class OccurrencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Version en vigueur à cette date : la plus récente dont la date d'effet est atteinte. */
  async effectiveTimetable(day: string) {
    return this.prisma.timetable.findFirst({
      where: {
        statut: { in: ['PUBLIE', 'ARCHIVE'] },
        dateEffet: { lte: toDateOnly(day) },
        academicYear: { dateDebut: { lte: toDateOnly(day) }, dateFin: { gte: toDateOnly(day) } },
      },
      orderBy: { dateEffet: 'desc' },
    });
  }

  private async closureOn(day: string) {
    return this.prisma.calendarEvent.findFirst({
      where: { dateDebut: { lte: toDateOnly(day) }, dateFin: { gte: toDateOnly(day) } },
    });
  }

  /** Séances d'un jour, avec l'enseignant et la salle effectivement en place (exceptions comprises). */
  async resolveDay(day: string, filters: OccurrenceFilters = {}) {
    const empty = { date: day, version: null as null | { id: string; numero: number }, sansClasse: null as null | { type: string; libelle: string }, seances: [] as Occurrence[] };
    const closure = await this.closureOn(day);
    if (closure) {
      return { ...empty, sansClasse: { type: closure.type, libelle: closure.libelle } };
    }
    const school = await this.prisma.school.findFirstOrThrow({ select: { joursClasse: true } });
    if (!school.joursClasse.includes(weekdayOf(day))) {
      return { ...empty, sansClasse: { type: 'AUTRE', libelle: 'Jour sans classe' } };
    }
    const timetable = await this.effectiveTimetable(day);
    if (!timetable) return empty;

    const entries = await this.prisma.timetableEntry.findMany({
      where: { timetableId: timetable.id, jourSemaine: weekdayOf(day) },
      include: {
        ...ENTRY_INCLUDE,
        exceptions: { where: { date: toDateOnly(day) }, include: EXCEPTION_INCLUDE },
      },
      orderBy: { heureDebut: 'asc' },
    });

    const seances: Occurrence[] = entries.map((e) => {
      const ex = e.exceptions[0] ?? null;
      const teacher = ex?.type === 'REMPLACEE' && ex.replacementTeacher ? ex.replacementTeacher : e.teacher;
      const room = ex?.type === 'SALLE_MODIFIEE' && ex.room ? ex.room : e.room;
      return {
        entryId: e.id,
        date: day,
        jourSemaine: e.jourSemaine,
        heureDebut: e.heureDebut,
        heureFin: e.heureFin,
        classId: e.classId,
        className: e.class.nom,
        subjectId: e.subjectId,
        subjectName: e.subject.nom,
        teacherId: teacher.id,
        teacherName: `${teacher.prenom} ${teacher.nom}`,
        roomId: room.id,
        roomName: room.nom,
        statut: ex ? (ex.type === 'ANNULEE' ? 'ANNULEE' : ex.type) : 'NORMALE',
        exception: ex
          ? {
              id: ex.id,
              type: ex.type,
              motif: ex.motif,
              enseignantInitial: `${e.teacher.prenom} ${e.teacher.nom}`,
              salleInitiale: e.room.nom,
            }
          : null,
      };
    });

    const filtered = seances.filter(
      (s) =>
        (!filters.classId || s.classId === filters.classId) &&
        (!filters.teacherId || s.teacherId === filters.teacherId) &&
        (!filters.roomId || s.roomId === filters.roomId),
    );
    return { ...empty, version: { id: timetable.id, numero: timetable.numero }, seances: filtered };
  }

  /** Semaine du lundi au dimanche qui contient `date`. */
  async week(date: string, filters: OccurrenceFilters) {
    const monday = mondayOf(date);
    const days: Awaited<ReturnType<OccurrencesService['resolveDay']>>[] = [];
    for (let i = 0; i < 7; i += 1) {
      days.push(await this.resolveDay(addDays(monday, i), filters));
    }
    return { debut: monday, fin: addDays(monday, 6), jours: days };
  }

  // ----------------------------------------------------------------- Exceptions

  listExceptions(from?: string, to?: string) {
    return this.prisma.timetableException.findMany({
      where: {
        date: {
          gte: from ? toDateOnly(from) : undefined,
          lte: to ? toDateOnly(to) : undefined,
        },
      },
      include: {
        ...EXCEPTION_INCLUDE,
        entry: { include: ENTRY_INCLUDE },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createException(entryId: string, dto: CreateExceptionDto, userId: string) {
    const entry = await this.prisma.timetableEntry.findUnique({
      where: { id: entryId },
      include: { ...ENTRY_INCLUDE, timetable: true },
    });
    if (!entry) {
      throw new NotFoundException('Séance introuvable.');
    }
    if (entry.timetable.statut === 'BROUILLON') {
      throw new ConflictException(
        'Un changement ponctuel porte sur un emploi du temps publié. Pour un brouillon, modifiez directement la séance.',
      );
    }
    if (weekdayOf(dto.date) !== entry.jourSemaine) {
      throw new UnprocessableEntityException('Cette date ne tombe pas le jour de cette séance.');
    }
    const effective = await this.effectiveTimetable(dto.date);
    if (!effective || effective.id !== entry.timetableId) {
      throw new UnprocessableEntityException(
        'Cette séance n’est pas en vigueur à cette date : une autre version de l’emploi du temps s’applique ce jour-là.',
      );
    }
    const closure = await this.closureOn(dto.date);
    if (closure) {
      throw new UnprocessableEntityException(`Ce jour est sans classe (${closure.libelle}).`);
    }
    const already = await this.prisma.timetableException.findUnique({
      where: { entryId_date: { entryId, date: toDateOnly(dto.date) } },
    });
    if (already) {
      throw new ConflictException(
        'Cette séance a déjà un changement ponctuel à cette date : supprimez-le d’abord pour en créer un autre.',
      );
    }

    let replacementTeacherId: string | null = null;
    let roomId: string | null = null;
    let roomName: string | undefined;

    if (dto.type === 'REMPLACEE') {
      if (!dto.replacementTeacherId) {
        throw new UnprocessableEntityException('Indiquez l’enseignant remplaçant.');
      }
      const teacher = await this.prisma.teacher.findUnique({ where: { id: dto.replacementTeacherId } });
      if (!teacher) throw new NotFoundException('Enseignant remplaçant introuvable.');
      if (teacher.statut !== 'ACTIF') {
        throw new ConflictException('Cet enseignant est inactif.');
      }
      if (teacher.id === entry.teacherId) {
        throw new UnprocessableEntityException('Le remplaçant est déjà l’enseignant de cette séance.');
      }
      const busy = await this.busyWith(dto.date, entry.heureDebut, entry.heureFin, entry.id, 'teacherId', teacher.id);
      if (busy) {
        throw new ConflictException(
          `${teacher.prenom} ${teacher.nom} a déjà cours à ce moment : ${busy.className}, ${busy.subjectName}, ${busy.heureDebut} - ${busy.heureFin}.`,
        );
      }
      replacementTeacherId = teacher.id;
    } else if (dto.type === 'SALLE_MODIFIEE') {
      if (!dto.roomId) {
        throw new UnprocessableEntityException('Indiquez la nouvelle salle.');
      }
      const room = await this.prisma.room.findUnique({ where: { id: dto.roomId } });
      if (!room) throw new NotFoundException('Salle introuvable.');
      if (!room.actif) throw new ConflictException('Cette salle est désactivée.');
      if (room.id === entry.roomId) {
        throw new UnprocessableEntityException('Cette séance a déjà lieu dans cette salle.');
      }
      const busy = await this.busyWith(dto.date, entry.heureDebut, entry.heureFin, entry.id, 'roomId', room.id);
      if (busy) {
        throw new ConflictException(
          `La salle ${room.nom} est déjà occupée à ce moment : ${busy.className}, ${busy.subjectName}, ${busy.heureDebut} - ${busy.heureFin}.`,
        );
      }
      roomId = room.id;
      roomName = room.nom;
    }

    const created = await this.prisma.timetableException.create({
      data: {
        entryId,
        date: toDateOnly(dto.date),
        type: dto.type,
        replacementTeacherId,
        roomId,
        motif: dto.motif.trim(),
        createdById: userId,
      },
      include: EXCEPTION_INCLUDE,
    });
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action: 'TIMETABLE_EXCEPTION_CREATE',
      entite: 'TimetableException',
      entiteId: created.id,
      ancienneValeur: null,
      nouvelleValeur: { ...created, date: isoDay(created.date) },
    });
    // Lot 12 : prévenir les responsables de la classe. Le motif reste interne : il n'est jamais transmis.
    await this.notifications.notifySessionChange(entry.classId, {
      kind: dto.type,
      date: dto.date,
      heureDebut: entry.heureDebut,
      heureFin: entry.heureFin,
      matiere: entry.subject.nom,
      salle: roomName,
    });
    return created;
  }

  /** Une autre séance (non annulée) occupe-t-elle déjà cet enseignant ou cette salle à ce moment précis ? */
  private async busyWith(
    day: string,
    debut: string,
    fin: string,
    exceptEntryId: string,
    by: 'teacherId' | 'roomId',
    id: string,
  ): Promise<Occurrence | null> {
    const resolved = await this.resolveDay(day);
    return (
      resolved.seances.find(
        (s) =>
          s.entryId !== exceptEntryId &&
          s.statut !== 'ANNULEE' &&
          s[by] === id &&
          overlaps(debut, fin, s.heureDebut, s.heureFin),
      ) ?? null
    );
  }

  async deleteException(id: string, userId: string) {
    const before = await this.prisma.timetableException.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Changement ponctuel introuvable.');
    }
    await this.prisma.timetableException.delete({ where: { id } });
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action: 'TIMETABLE_EXCEPTION_DELETE',
      entite: 'TimetableException',
      entiteId: id,
      ancienneValeur: { ...before, date: isoDay(before.date) },
      nouvelleValeur: null,
    });
    return { id };
  }
}

export interface Occurrence {
  entryId: string;
  date: string;
  jourSemaine: number;
  heureDebut: string;
  heureFin: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  roomId: string;
  roomName: string;
  statut: 'NORMALE' | 'ANNULEE' | 'REMPLACEE' | 'SALLE_MODIFIEE';
  exception: {
    id: string;
    type: string;
    motif: string;
    enseignantInitial: string;
    salleInitiale: string;
  } | null;
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { NotificationsService, type AttendanceItem } from '../notifications/notifications.service';
import { OccurrencesService, type Occurrence } from '../timetable/occurrences.service';
import { toMinutes } from '../timetable/timetable.util';
import { isoDay, toDateOnly } from '../pedagogy/pedagogy.util';
import { dayInTimezone, statusForDelay } from './attendance.util';
import { SaveCallDto } from './dto/attendance.dto';
import type { CurrentUserData } from '../auth/types/current-user.interface';

const OFFLINE_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const OFFLINE_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Portée d'un compte sur l'appel : null = toute l'école (ATTENDANCE_READ : vie scolaire, Direction) ;
 * sinon uniquement les séances tenues par cet enseignant (remplacements compris, RV12 : un enseignant n'a pas
 * à voir les absences des autres classes).
 */
export type AttendanceScope = { teacherId: string } | null;

export interface Actor {
  id: string;
  /** Vrai pour la vie scolaire et la Direction (ATTENDANCE_CORRECT). */
  canCorrect: boolean;
  /** Absent = toute l'école. */
  scope?: AttendanceScope;
}

type State = { statut: 'PRESENT' | 'RETARD' | 'ABSENT'; minutesRetard: number | null };

const RECORD_INCLUDE = {
  justification: { include: { reason: true } },
  corrections: { include: { user: { select: { nom: true, prenom: true } } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.AttendanceRecordInclude;

/**
 * Appel des élèves séance par séance (D60) et correction encadrée (RV04). Le serveur calcule le statut
 * d'après les seuils paramétrés (RV05) ; un appel est unique par séance et par date, donc renvoyer la
 * même saisie deux fois (synchronisation hors ligne, réponse perdue) ne crée jamais de doublon.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
    private readonly occurrences: OccurrencesService,
    private readonly notifications: NotificationsService,
  ) {}

  private async context() {
    const school = await this.prisma.school.findFirstOrThrow({
      select: { id: true, fuseauHoraire: true, retardMaxMinutes: true, delaiJustificatifJours: true, joursClasse: true },
    });
    return { ...school, today: dayInTimezone(new Date(), school.fuseauHoraire) };
  }

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

  /**
   * Portée du compte : la vie scolaire et la Direction (ATTENDANCE_READ) voient toute l'école, un enseignant
   * (ATTENDANCE_TAKE seul) uniquement ses séances. Un compte sans fiche enseignant reliée n'a aucune portée.
   */
  async scopeOf(user: CurrentUserData): Promise<AttendanceScope> {
    if (user.permissions.includes('ATTENDANCE_READ')) return null;
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!teacher) {
      throw new ForbiddenException(
        "Votre compte n'est relié à aucune fiche enseignant : l'appel n'est pas accessible.",
      );
    }
    return { teacherId: teacher.id };
  }

  private assertInScope(seance: Occurrence, scope: AttendanceScope | undefined) {
    if (scope && seance.teacherId !== scope.teacherId) {
      throw new ForbiddenException("Cette séance n'est pas la vôtre : vous ne pouvez faire l'appel que de vos séances.");
    }
  }

  // ---------------------------------------------------------------- Lecture d'une journée

  /** Séances d'un jour avec l'état de leur appel (à faire, fait par qui, combien d'absents). */
  async day(date: string, classId?: string, scope?: AttendanceScope) {
    const ctx = await this.context();
    const resolved = await this.occurrences.resolveDay(date, { classId, teacherId: scope?.teacherId });
    const calls = await this.prisma.attendanceCall.findMany({
      where: { date: toDateOnly(date), entryId: { in: resolved.seances.map((s) => s.entryId) } },
      include: {
        takenBy: { select: { nom: true, prenom: true } },
        records: { select: { statut: true } },
      },
    });
    const byEntry = new Map(calls.map((c) => [c.entryId, c]));
    return {
      date,
      aujourdhui: ctx.today,
      verrouille: date < ctx.today,
      futur: date > ctx.today,
      sansClasse: resolved.sansClasse,
      seances: resolved.seances.map((s) => {
        const call = byEntry.get(s.entryId);
        return {
          ...s,
          appel: call
            ? {
                id: call.id,
                par: `${call.takenBy.prenom} ${call.takenBy.nom}`,
                absents: call.records.filter((r) => r.statut === 'ABSENT').length,
                retards: call.records.filter((r) => r.statut === 'RETARD').length,
                eleves: call.records.length,
                horsLigne: call.saisieHorsLigneAt !== null,
              }
            : null,
        };
      }),
    };
  }

  private async findOccurrence(entryId: string, date: string): Promise<Occurrence> {
    const resolved = await this.occurrences.resolveDay(date);
    const seance = resolved.seances.find((s) => s.entryId === entryId);
    if (!seance) {
      throw new UnprocessableEntityException(
        resolved.sansClasse
          ? `Ce jour est sans classe (${resolved.sansClasse.libelle}).`
          : "Cette séance n'a pas lieu à cette date : elle ne figure pas dans l'emploi du temps en vigueur ce jour-là.",
      );
    }
    return seance;
  }

  /** Élèves inscrits (inscription active) dans la classe de la séance, par ordre alphabétique. */
  private async roster(classId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, statut: 'ACTIVE', student: { statut: 'ACTIF' } },
      include: { student: true },
    });
    return enrollments
      .map((e) => e.student)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
  }

  /** Feuille d'appel : l'appel existant, ou tout le monde présent par défaut (D60). */
  async sheet(entryId: string, date: string, scope?: AttendanceScope) {
    const ctx = await this.context();
    const seance = await this.findOccurrence(entryId, date);
    this.assertInScope(seance, scope);
    const roster = await this.roster(seance.classId);
    const call = await this.prisma.attendanceCall.findUnique({
      where: { entryId_date: { entryId, date: toDateOnly(date) } },
      include: {
        takenBy: { select: { id: true, nom: true, prenom: true } },
        records: { include: { student: true, ...RECORD_INCLUDE } },
      },
    });

    const recordByStudent = new Map((call?.records ?? []).map((r) => [r.studentId, r]));
    const rosterIds = new Set(roster.map((s) => s.id));
    // Un élève qui a quitté la classe depuis l'appel garde sa ligne ; un nouvel inscrit apparaît présent.
    const students = [
      ...roster,
      ...(call?.records ?? []).filter((r) => !rosterIds.has(r.studentId)).map((r) => r.student),
    ];

    return {
      seance,
      date,
      aujourdhui: ctx.today,
      verrouille: date < ctx.today,
      parametres: { retardMaxMinutes: ctx.retardMaxMinutes },
      appel: call
        ? {
            id: call.id,
            par: { id: call.takenBy.id, nom: `${call.takenBy.prenom} ${call.takenBy.nom}` },
            pris: call.takenAt,
            horsLigne: call.saisieHorsLigneAt !== null,
          }
        : null,
      eleves: students.map((s) => {
        const r = recordByStudent.get(s.id);
        return {
          studentId: s.id,
          matricule: s.matricule,
          nom: s.nom,
          prenom: s.prenom,
          recordId: r?.id ?? null,
          statut: r?.statut ?? 'PRESENT',
          minutesRetard: r?.minutesRetard ?? null,
          // Le motif et le commentaire d'un justificatif peuvent relever de la santé ou de la famille :
          // un enseignant en voit le statut, pas le contenu (RV12, strict nécessaire).
          justification: r?.justification
            ? {
                id: r.justification.id,
                statut: r.justification.statut,
                motif: scope ? null : (r.justification.reason?.libelle ?? null),
                commentaire: scope ? null : r.justification.commentaire,
                horsDelai: r.justification.horsDelai,
              }
            : null,
          corrections: (r?.corrections ?? []).length,
        };
      }),
    };
  }

  // ------------------------------------------------------------------- Saisie d'un appel

  private checkOfflineStamp(saisiLe: string | undefined): Date | null {
    if (!saisiLe) return null;
    const at = new Date(saisiLe);
    const now = Date.now();
    if (at.getTime() > now + OFFLINE_CLOCK_SKEW_MS) {
      throw new BadRequestException("L'heure de saisie est dans le futur.");
    }
    if (at.getTime() < now - OFFLINE_MAX_AGE_MS) {
      throw new BadRequestException("L'heure de saisie est trop ancienne (plus de 45 jours).");
    }
    return at;
  }

  async saveCall(dto: SaveCallDto, actor: Actor) {
    const ctx = await this.context();
    if (dto.date > ctx.today) {
      throw new UnprocessableEntityException("Impossible de faire l'appel d'une séance qui n'a pas encore eu lieu.");
    }
    const seance = await this.findOccurrence(dto.entryId, dto.date);
    this.assertInScope(seance, actor.scope);
    if (seance.statut === 'ANNULEE') {
      throw new UnprocessableEntityException('Cette séance est annulée : il n’y a pas d’appel à faire.');
    }

    const roster = await this.roster(seance.classId);
    const existing = await this.prisma.attendanceCall.findUnique({
      where: { entryId_date: { entryId: dto.entryId, date: toDateOnly(dto.date) } },
      include: { records: true, takenBy: { select: { nom: true, prenom: true } } },
    });
    // Un élève déjà appelé qui a quitté la classe depuis reste valide dans une correction.
    const knownIds = new Set([...roster.map((s) => s.id), ...(existing?.records ?? []).map((r) => r.studentId)]);

    // Statut de chaque élève d'après les seuils (RV05). Absent de la liste = présent (D60).
    const duration = toMinutes(seance.heureFin) - toMinutes(seance.heureDebut);
    const wanted = new Map<string, State>();
    for (const item of dto.absences) {
      if (!knownIds.has(item.studentId)) {
        throw new UnprocessableEntityException("Un élève de la liste n'est pas inscrit dans la classe de cette séance.");
      }
      if (wanted.has(item.studentId)) {
        throw new BadRequestException('Un élève figure deux fois dans la liste.');
      }
      if (item.absent) {
        wanted.set(item.studentId, { statut: 'ABSENT', minutesRetard: null });
      } else if (item.minutesRetard) {
        if (item.minutesRetard > duration) {
          throw new UnprocessableEntityException(
            `Un retard de ${item.minutesRetard} minutes dépasse la durée de la séance (${duration} minutes).`,
          );
        }
        wanted.set(item.studentId, {
          statut: statusForDelay(item.minutesRetard, ctx.retardMaxMinutes),
          minutesRetard: item.minutesRetard,
        });
      } else {
        throw new BadRequestException('Indiquez « absent » ou un nombre de minutes de retard pour chaque élève listé.');
      }
    }

    const stamp = this.checkOfflineStamp(dto.saisiLe);
    const stampOnTheDay = stamp !== null && dayInTimezone(stamp, ctx.fuseauHoraire) === dto.date;
    const locked = dto.date < ctx.today;
    const motif = dto.motif?.trim() ?? '';

    // Qui a le droit de poser ou de modifier cet appel (RV04, D59).
    let correction = false;
    if (!existing) {
      if (locked && !stampOnTheDay) {
        if (!actor.canCorrect) {
          throw new ForbiddenException(
            "Le jour de cette séance est passé : l'appel doit être saisi par la vie scolaire ou la Direction.",
          );
        }
        if (!motif) {
          throw new UnprocessableEntityException('Un appel saisi après coup exige un motif.');
        }
        correction = true;
      }
    } else {
      const author = existing.takenById === actor.id;
      if (!author) {
        if (!actor.canCorrect) {
          throw new ConflictException(
            `Cet appel a déjà été fait par ${existing.takenBy.prenom} ${existing.takenBy.nom}.`,
          );
        }
        correction = true;
      } else if (locked && !stampOnTheDay) {
        if (!actor.canCorrect) {
          throw new ForbiddenException(
            "Cet appel est verrouillé depuis la fin de la journée : la correction revient à la vie scolaire ou à la Direction.",
          );
        }
        correction = true;
      }
      if (correction && !motif) {
        throw new UnprocessableEntityException('Une correction exige un motif.');
      }
    }

    const stateOf = (studentId: string): State => wanted.get(studentId) ?? { statut: 'PRESENT', minutesRetard: null };
    const idsToWrite = new Set([...roster.map((s) => s.id), ...(existing?.records ?? []).map((r) => r.studentId)]);

    let callId: string;
    try {
      callId = await this.prisma.$transaction(async (tx) => {
        if (!existing) {
          const created = await tx.attendanceCall.create({
            data: {
              entryId: dto.entryId,
              date: toDateOnly(dto.date),
              classId: seance.classId,
              subjectId: seance.subjectId,
              teacherId: seance.teacherId,
              heureDebut: seance.heureDebut,
              heureFin: seance.heureFin,
              takenById: actor.id,
              saisieHorsLigneAt: stamp ?? undefined,
              records: {
                create: [...idsToWrite].map((studentId) => ({ studentId, ...stateOf(studentId) })),
              },
            },
            include: { records: true },
          });
          if (correction) {
            for (const r of created.records) {
              if (r.statut !== 'PRESENT') {
                await tx.attendanceCorrection.create({
                  data: {
                    recordId: r.id,
                    ancienStatut: 'PRESENT',
                    ancienMinutes: null,
                    nouveauStatut: r.statut,
                    nouveauMinutes: r.minutesRetard,
                    motif,
                    userId: actor.id,
                  },
                });
              }
            }
          }
          return created.id;
        }

        const before = new Map(existing.records.map((r) => [r.studentId, r]));
        for (const studentId of idsToWrite) {
          const next = stateOf(studentId);
          const prev = before.get(studentId);
          if (!prev) {
            await tx.attendanceRecord.create({ data: { callId: existing.id, studentId, ...next } });
            continue;
          }
          if (prev.statut === next.statut && prev.minutesRetard === next.minutesRetard) continue;
          await tx.attendanceRecord.update({ where: { id: prev.id }, data: next });
          if (correction) {
            await tx.attendanceCorrection.create({
              data: {
                recordId: prev.id,
                ancienStatut: prev.statut,
                ancienMinutes: prev.minutesRetard,
                nouveauStatut: next.statut,
                nouveauMinutes: next.minutesRetard,
                motif,
                userId: actor.id,
              },
            });
          }
        }
        await tx.attendanceCall.update({ where: { id: existing.id }, data: { updatedAt: new Date() } });
        return existing.id;
      });
    } catch (err) {
      // Deux appareils ont créé le même appel en même temps : le second rejoue sur l'appel du premier.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && !existing) {
        return this.saveCall(dto, actor);
      }
      throw err;
    }

    const summary = {
      absents: [...wanted.values()].filter((s) => s.statut === 'ABSENT').length,
      retards: [...wanted.values()].filter((s) => s.statut === 'RETARD').length,
      eleves: idsToWrite.size,
    };
    await this.log(
      actor.id,
      correction ? 'ATTENDANCE_CALL_CORRECT' : existing ? 'ATTENDANCE_CALL_UPDATE' : 'ATTENDANCE_CALL_CREATE',
      'AttendanceCall',
      callId,
      existing
        ? {
            absents: existing.records.filter((r) => r.statut === 'ABSENT').length,
            retards: existing.records.filter((r) => r.statut === 'RETARD').length,
          }
        : null,
      { ...summary, date: dto.date, entryId: dto.entryId, ...(correction ? { motif } : {}), horsLigne: stamp !== null },
    );

    // Lot 12 : on ne prévient les responsables que de ce qui vient de CHANGER (un appel renvoyé à
    // l'identique, par exemple après une coupure, ne renotifie personne). Jamais bloquant : le service
    // de notification attrape toute erreur.
    const changes: AttendanceItem[] = [];
    for (const studentId of idsToWrite) {
      const next = stateOf(studentId);
      if (next.statut === 'PRESENT') continue;
      const before = existing?.records.find((r) => r.studentId === studentId)?.statut ?? 'PRESENT';
      if (before === next.statut) continue;
      changes.push({
        studentId,
        statut: next.statut,
        minutesRetard: next.minutesRetard,
        date: dto.date,
        heureDebut: seance.heureDebut,
        heureFin: seance.heureFin,
        matiere: seance.subjectName,
      });
    }
    await this.notifications.notifyAttendance(changes);
    return this.sheet(dto.entryId, dto.date, actor.scope);
  }

  // ------------------------------------------------------------ Absences et historique

  /**
   * Absences et retards (jamais les présences) avec leur justification. Sert à la fois à l'historique
   * d'un élève et à la liste de travail de la vie scolaire.
   */
  async listAbsences(filters: {
    studentId?: string;
    classId?: string;
    from?: string;
    to?: string;
    justification?: 'aucune' | 'attente' | 'acceptee' | 'refusee';
  }) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filters.from) dateFilter.gte = toDateOnly(filters.from);
    if (filters.to) dateFilter.lte = toDateOnly(filters.to);

    const justificationWhere: Prisma.AttendanceRecordWhereInput =
      filters.justification === 'aucune'
        ? { justification: null }
        : filters.justification === 'attente'
          ? { justification: { statut: 'EN_ATTENTE' } }
          : filters.justification === 'acceptee'
            ? { justification: { statut: 'ACCEPTEE' } }
            : filters.justification === 'refusee'
              ? { justification: { statut: 'REFUSEE' } }
              : {};

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        statut: { in: ['RETARD', 'ABSENT'] },
        studentId: filters.studentId,
        call: {
          classId: filters.classId,
          date: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        },
        ...justificationWhere,
      },
      include: {
        student: true,
        call: { include: { class: true, subject: true, teacher: true } },
        ...RECORD_INCLUDE,
      },
      orderBy: [{ call: { date: 'desc' } }, { call: { heureDebut: 'desc' } }],
      take: 500,
    });

    return records.map((r) => ({
      recordId: r.id,
      date: isoDay(r.call.date),
      heureDebut: r.call.heureDebut,
      heureFin: r.call.heureFin,
      studentId: r.studentId,
      eleve: `${r.student.prenom} ${r.student.nom}`,
      matricule: r.student.matricule,
      classe: r.call.class.nom,
      matiere: r.call.subject.nom,
      enseignant: `${r.call.teacher.prenom} ${r.call.teacher.nom}`,
      statut: r.statut,
      minutesRetard: r.minutesRetard,
      justification: r.justification
        ? {
            id: r.justification.id,
            statut: r.justification.statut,
            motif: r.justification.reason?.libelle ?? null,
            commentaire: r.justification.commentaire,
            horsDelai: r.justification.horsDelai,
            decision: r.justification.decisionCommentaire,
          }
        : null,
      corrections: r.corrections.map((c) => ({
        date: c.createdAt,
        par: `${c.user.prenom} ${c.user.nom}`,
        de: c.ancienStatut,
        vers: c.nouveauStatut,
        motif: c.motif,
      })),
    }));
  }

  /** Historique d'un élève : ses absences et retards, avec les compteurs de la période. */
  async studentHistory(studentId: string, from?: string, to?: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      throw new NotFoundException('Élève introuvable.');
    }
    const lignes = await this.listAbsences({ studentId, from, to });
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = toDateOnly(from);
    if (to) dateFilter.lte = toDateOnly(to);
    const seancesAppelees = await this.prisma.attendanceRecord.count({
      where: { studentId, call: { date: Object.keys(dateFilter).length > 0 ? dateFilter : undefined } },
    });
    const excused = (l: (typeof lignes)[number]) => l.justification?.statut === 'ACCEPTEE';
    return {
      eleve: { id: student.id, nom: student.nom, prenom: student.prenom, matricule: student.matricule },
      compteurs: {
        seancesAppelees,
        absences: lignes.filter((l) => l.statut === 'ABSENT').length,
        retards: lignes.filter((l) => l.statut === 'RETARD').length,
        excusees: lignes.filter(excused).length,
        nonJustifiees: lignes.filter((l) => !excused(l)).length,
      },
      lignes,
    };
  }
}

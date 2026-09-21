import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type Teacher, type TeacherDayCheckin, type TeacherSessionCheckin } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { OccurrencesService, type Occurrence } from '../timetable/occurrences.service';
import { addDays } from '../timetable/timetable.util';
import { isoDay, toDateOnly } from '../pedagogy/pedagogy.util';
import { dayInTimezone } from '../attendance/attendance.util';
import { PointageCodesService } from './pointage-codes.service';
import { localToInstant, minutesBetween, plannedMinutes, timeInTimezone } from './checkin.util';
import { DecideCheckinDto, ManualDayDto, ManualSessionDto, ScanDto } from './dto/checkin.dto';

const OFFLINE_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const OFFLINE_CLOCK_SKEW_MS = 5 * 60 * 1000;

type Ctx = Awaited<ReturnType<TeacherCheckinsService['context']>>;

/**
 * Pointage des enseignants (D62, RV06, RV07). Un enseignant scanne avec son compte : le pointage naît
 * « en attente » et c'est un tiers qui le valide, jamais lui-même. Les heures effectuées se calculent
 * d'après les pointages validés, elles ne sont jamais saisies.
 */
@Injectable()
export class TeacherCheckinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
    private readonly occurrences: OccurrencesService,
    private readonly codes: PointageCodesService,
  ) {}

  private async context() {
    const school = await this.prisma.school.findFirstOrThrow({
      select: {
        fuseauHoraire: true,
        pointageFenetreMinutes: true,
        pointageToleranceMinutes: true,
        pointageEcartMinMinutes: true,
      },
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

  /** La fiche enseignant reliée au compte connecté. */
  private async requireTeacher(userId: string): Promise<Teacher> {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) {
      throw new ForbiddenException(
        "Votre compte n'est relié à aucune fiche enseignant. Demandez à la vie scolaire de le relier.",
      );
    }
    return teacher;
  }

  private checkStamp(scanneLe: string | undefined): Date | null {
    if (!scanneLe) return null;
    const at = new Date(scanneLe);
    const now = Date.now();
    if (at.getTime() > now + OFFLINE_CLOCK_SKEW_MS) throw new BadRequestException("L'heure du scan est dans le futur.");
    if (at.getTime() < now - OFFLINE_MAX_AGE_MS) throw new BadRequestException("L'heure du scan est trop ancienne (plus de 45 jours).");
    return at;
  }

  // ------------------------------------------------------------------------- Scan

  async scan(userId: string, dto: ScanDto) {
    const ctx = await this.context();
    const teacher = await this.requireTeacher(userId);
    if (teacher.statut !== 'ACTIF') {
      throw new ConflictException('Votre fiche enseignant est inactive : le pointage est fermé.');
    }
    const stamp = this.checkStamp(dto.scanneLe);
    const at = stamp ?? new Date();
    const code = await this.codes.resolve(dto.code.trim());
    const day = dayInTimezone(at, ctx.fuseauHoraire);

    if (teacher.modePointage === 'SEANCE') {
      if (!code.roomId) {
        throw new UnprocessableEntityException("Ce QR est celui de l'entrée de l'école. Scannez le QR de votre salle de cours.");
      }
      return this.scanSession(ctx, teacher, { roomId: code.roomId, roomNom: code.room?.nom ?? '' }, day, at, stamp !== null);
    }
    if (code.roomId) {
      throw new UnprocessableEntityException("Ce QR est celui d'une salle. Scannez le QR de l'entrée de l'école.");
    }
    return this.scanDay(ctx, teacher, day, at, stamp !== null);
  }

  private sessionView(occ: Occurrence) {
    return {
      className: occ.className,
      subjectName: occ.subjectName,
      heureDebut: occ.heureDebut,
      heureFin: occ.heureFin,
      roomName: occ.roomName,
    };
  }

  private async scanSession(
    ctx: Ctx,
    teacher: Teacher,
    room: { roomId: string; roomNom: string },
    day: string,
    at: Date,
    offline: boolean,
    retried = false,
  ): Promise<Record<string, unknown>> {
    const resolved = await this.occurrences.resolveDay(day, { teacherId: teacher.id });
    if (resolved.sansClasse) {
      throw new UnprocessableEntityException(`Ce jour est sans classe (${resolved.sansClasse.libelle}).`);
    }
    const seances = resolved.seances.filter((s) => s.statut !== 'ANNULEE');
    if (seances.length === 0) {
      throw new UnprocessableEntityException("Vous n'avez aucune séance ce jour-là.");
    }
    const existing = await this.prisma.teacherSessionCheckin.findMany({
      where: { teacherId: teacher.id, date: toDateOnly(day), entryId: { in: seances.map((s) => s.entryId) } },
    });
    const byEntry = new Map(existing.map((c) => [c.entryId, c]));
    const window = ctx.pointageFenetreMinutes * 60000;
    const gap = ctx.pointageEcartMinMinutes * 60000;

    // Le même scan renvoyé (réponse perdue, relecture de la file) ne change rien.
    for (const s of seances) {
      const ck = byEntry.get(s.entryId);
      if (ck && (ck.debutAt?.getTime() === at.getTime() || ck.finAt?.getTime() === at.getTime())) {
        return this.sessionResult(ctx, s, ck, ck.finAt?.getTime() === at.getTime() ? 'FIN' : 'DEBUT', offline);
      }
    }

    // Ce que ce scan peut signifier : un début (dès la fenêtre d'ouverture) ou une fin (jusqu'à la fenêtre
    // après l'heure prévue). On retient l'événement dont l'heure prévue est la plus proche ; à égalité,
    // la fin d'abord (à la jonction de deux cours, le scan suivant ouvre le cours d'après).
    type Cand = { kind: 'DEBUT' | 'FIN'; s: Occurrence; ref: Date; ck?: TeacherSessionCheckin };
    const candidates: Cand[] = [];
    for (const s of seances) {
      const ck = byEntry.get(s.entryId);
      if (ck && ck.statut !== 'EN_ATTENTE') continue;
      const startAt = localToInstant(day, s.heureDebut, ctx.fuseauHoraire);
      const endAt = localToInstant(day, s.heureFin, ctx.fuseauHoraire);
      if (!ck?.debutAt) {
        if (at.getTime() >= startAt.getTime() - window && at.getTime() <= endAt.getTime()) {
          candidates.push({ kind: 'DEBUT', s, ref: startAt, ck });
        }
      } else if (!ck.finAt) {
        if (at.getTime() >= ck.debutAt.getTime() + gap && at.getTime() <= endAt.getTime() + window) {
          candidates.push({ kind: 'FIN', s, ref: endAt, ck });
        }
      }
    }
    candidates.sort(
      (a, b) =>
        Math.abs(at.getTime() - a.ref.getTime()) - Math.abs(at.getTime() - b.ref.getTime()) ||
        (a.kind === b.kind ? 0 : a.kind === 'FIN' ? -1 : 1),
    );
    const chosen = candidates[0];
    if (!chosen) {
      const recent = existing.find((c) => c.debutAt && at.getTime() - c.debutAt.getTime() < gap && at.getTime() >= c.debutAt.getTime());
      if (recent?.debutAt) {
        throw new ConflictException(`Vous avez déjà pointé à ${timeInTimezone(recent.debutAt, ctx.fuseauHoraire)}.`);
      }
      const done = seances.every((s) => {
        const ck = byEntry.get(s.entryId);
        return ck && (ck.finAt || ck.statut !== 'EN_ATTENTE');
      });
      if (done) throw new ConflictException('Toutes vos séances de ce jour sont déjà pointées.');
      const list = seances.map((s) => `${s.heureDebut}-${s.heureFin} ${s.className}`).join(', ');
      throw new UnprocessableEntityException(`Aucune séance à pointer à cette heure. Vos séances ce jour-là : ${list}.`);
    }

    const { s, kind, ck } = chosen;
    const ecart = room.roomId !== s.roomId;
    try {
      let saved: TeacherSessionCheckin;
      if (kind === 'DEBUT') {
        const startAt = localToInstant(day, s.heureDebut, ctx.fuseauHoraire);
        saved = await this.prisma.teacherSessionCheckin.create({
          data: {
            teacherId: teacher.id,
            entryId: s.entryId,
            date: toDateOnly(day),
            classId: s.classId,
            heureDebut: s.heureDebut,
            heureFin: s.heureFin,
            debutAt: at,
            debutRecuAt: new Date(),
            retardMinutes: Math.max(0, minutesBetween(startAt, at)),
            ecartSalle: ecart,
          },
        });
      } else {
        saved = await this.prisma.teacherSessionCheckin.update({
          where: { id: ck!.id },
          data: { finAt: at, finRecuAt: new Date(), ecartSalle: ck!.ecartSalle || ecart },
        });
      }
      return this.sessionResult(ctx, s, saved, kind, offline);
    } catch (err) {
      // Deux scans simultanés ont créé le même pointage : le second rejoue sur celui du premier.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && !retried) {
        return this.scanSession(ctx, teacher, room, day, at, offline, true);
      }
      throw err;
    }
  }

  private sessionResult(ctx: Ctx, s: Occurrence, ck: TeacherSessionCheckin, type: 'DEBUT' | 'FIN', offline: boolean) {
    const at = type === 'DEBUT' ? ck.debutAt : ck.finAt;
    const retard = type === 'DEBUT' ? (ck.retardMinutes ?? 0) : 0;
    return {
      mode: 'SEANCE',
      type,
      pointageId: ck.id,
      at,
      heure: at ? timeInTimezone(at, ctx.fuseauHoraire) : null,
      seance: this.sessionView(s),
      retardMinutes: retard,
      retardSignale: retard > ctx.pointageToleranceMinutes,
      ecartSalle: ck.ecartSalle,
      statut: ck.statut,
      horsLigne: offline,
    };
  }

  private async scanDay(ctx: Ctx, teacher: Teacher, day: string, at: Date, offline: boolean, retried = false): Promise<Record<string, unknown>> {
    const existing = await this.prisma.teacherDayCheckin.findUnique({
      where: { teacherId_date: { teacherId: teacher.id, date: toDateOnly(day) } },
    });
    const gap = ctx.pointageEcartMinMinutes * 60000;

    if (existing && (existing.arriveeAt?.getTime() === at.getTime() || existing.departAt?.getTime() === at.getTime())) {
      return this.dayResult(ctx, existing, existing.departAt?.getTime() === at.getTime() ? 'DEPART' : 'ARRIVEE', offline);
    }

    if (!existing) {
      // Retard : comparé à la première séance prévue ce jour-là. Sans séance, aucune heure d'attente n'est inventée.
      const resolved = await this.occurrences.resolveDay(day, { teacherId: teacher.id });
      const first = resolved.seances.filter((s) => s.statut !== 'ANNULEE').sort((a, b) => a.heureDebut.localeCompare(b.heureDebut))[0];
      const heurePrevue = first?.heureDebut ?? null;
      try {
        const created = await this.prisma.teacherDayCheckin.create({
          data: {
            teacherId: teacher.id,
            date: toDateOnly(day),
            arriveeAt: at,
            arriveeRecuAt: new Date(),
            heurePrevue,
            retardMinutes: heurePrevue ? Math.max(0, minutesBetween(localToInstant(day, heurePrevue, ctx.fuseauHoraire), at)) : null,
          },
        });
        return this.dayResult(ctx, created, 'ARRIVEE', offline);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && !retried) {
          return this.scanDay(ctx, teacher, day, at, offline, true);
        }
        throw err;
      }
    }

    if (existing.statut !== 'EN_ATTENTE') {
      throw new ConflictException('Votre pointage de ce jour a déjà été traité par la vie scolaire.');
    }
    const last = existing.departAt ?? existing.arriveeAt;
    if (last && at.getTime() - last.getTime() < gap) {
      throw new ConflictException(`Vous avez déjà pointé à ${timeInTimezone(last, ctx.fuseauHoraire)}.`);
    }
    // Le départ est le dernier scan de la journée.
    const updated = await this.prisma.teacherDayCheckin.update({
      where: { id: existing.id },
      data: { departAt: at, departRecuAt: new Date() },
    });
    return this.dayResult(ctx, updated, 'DEPART', offline);
  }

  private dayResult(ctx: Ctx, ck: TeacherDayCheckin, type: 'ARRIVEE' | 'DEPART', offline: boolean) {
    const at = type === 'ARRIVEE' ? ck.arriveeAt : ck.departAt;
    const retard = type === 'ARRIVEE' ? ck.retardMinutes : null;
    return {
      mode: 'JOURNEE',
      type,
      pointageId: ck.id,
      at,
      heure: at ? timeInTimezone(at, ctx.fuseauHoraire) : null,
      heurePrevue: ck.heurePrevue,
      retardMinutes: retard ?? 0,
      retardSignale: (retard ?? 0) > ctx.pointageToleranceMinutes,
      statut: ck.statut,
      horsLigne: offline,
    };
  }

  // -------------------------------------------------------- Vue de l'enseignant

  /** Ce que voit l'enseignant : ses séances (ou sa journée) du jour et l'état de ses pointages. */
  async mine(userId: string) {
    const ctx = await this.context();
    const teacher = await this.requireTeacher(userId);
    const day = ctx.today;
    const base = {
      teacher: { id: teacher.id, nom: teacher.nom, prenom: teacher.prenom, modePointage: teacher.modePointage },
      date: day,
    };
    if (teacher.modePointage === 'JOURNEE') {
      const ck = await this.prisma.teacherDayCheckin.findUnique({
        where: { teacherId_date: { teacherId: teacher.id, date: toDateOnly(day) } },
      });
      return { ...base, seances: [], journee: ck ? this.daySerialize(ctx, ck) : null };
    }
    const resolved = await this.occurrences.resolveDay(day, { teacherId: teacher.id });
    const list = resolved.seances.filter((s) => s.statut !== 'ANNULEE');
    const cks = await this.prisma.teacherSessionCheckin.findMany({
      where: { teacherId: teacher.id, date: toDateOnly(day) },
    });
    return {
      ...base,
      journee: null,
      sansClasse: resolved.sansClasse,
      seances: list.map((s) => {
        const ck = cks.find((c) => c.entryId === s.entryId);
        return { ...this.sessionView(s), entryId: s.entryId, pointage: ck ? this.sessionSerialize(ctx, ck) : null };
      }),
    };
  }

  private sessionSerialize(ctx: Ctx, ck: TeacherSessionCheckin) {
    const late = (recu: Date | null, at: Date | null) => (recu && at ? Math.abs(recu.getTime() - at.getTime()) > 120000 : false);
    return {
      id: ck.id,
      statut: ck.statut,
      source: ck.source,
      debut: ck.debutAt ? timeInTimezone(ck.debutAt, ctx.fuseauHoraire) : null,
      fin: ck.finAt ? timeInTimezone(ck.finAt, ctx.fuseauHoraire) : null,
      retardMinutes: ck.retardMinutes,
      retardSignale: (ck.retardMinutes ?? 0) > ctx.pointageToleranceMinutes,
      ecartSalle: ck.ecartSalle,
      horsLigne: late(ck.debutRecuAt, ck.debutAt) || late(ck.finRecuAt, ck.finAt),
      motif: ck.motif,
    };
  }

  private daySerialize(ctx: Ctx, ck: TeacherDayCheckin) {
    const late = (recu: Date | null, at: Date | null) => (recu && at ? Math.abs(recu.getTime() - at.getTime()) > 120000 : false);
    return {
      id: ck.id,
      statut: ck.statut,
      source: ck.source,
      arrivee: ck.arriveeAt ? timeInTimezone(ck.arriveeAt, ctx.fuseauHoraire) : null,
      depart: ck.departAt ? timeInTimezone(ck.departAt, ctx.fuseauHoraire) : null,
      heurePrevue: ck.heurePrevue,
      retardMinutes: ck.retardMinutes,
      retardSignale: (ck.retardMinutes ?? 0) > ctx.pointageToleranceMinutes,
      horsLigne: late(ck.arriveeRecuAt, ck.arriveeAt) || late(ck.departRecuAt, ck.departAt),
      motif: ck.motif,
    };
  }

  // ------------------------------------------------------ Vue du validateur

  /** Tous les pointages d'un jour, avec les séances qui n'ont pas été pointées. */
  async listDay(day: string) {
    const ctx = await this.context();
    const resolved = await this.occurrences.resolveDay(day);
    const teachers = await this.prisma.teacher.findMany();
    const byTeacher = new Map(teachers.map((t) => [t.id, t]));

    const seances = resolved.seances.filter((s) => s.statut !== 'ANNULEE' && byTeacher.get(s.teacherId)?.modePointage === 'SEANCE');
    const cks = await this.prisma.teacherSessionCheckin.findMany({ where: { date: toDateOnly(day) } });

    const journeeTeachers = new Set<string>();
    for (const s of resolved.seances) {
      if (s.statut !== 'ANNULEE' && byTeacher.get(s.teacherId)?.modePointage === 'JOURNEE') journeeTeachers.add(s.teacherId);
    }
    const dayCks = await this.prisma.teacherDayCheckin.findMany({ where: { date: toDateOnly(day) } });
    for (const d of dayCks) journeeTeachers.add(d.teacherId);

    return {
      date: day,
      aujourdhui: ctx.today,
      sansClasse: resolved.sansClasse,
      seances: seances.map((s) => {
        const ck = cks.find((c) => c.entryId === s.entryId);
        return { ...s, pointage: ck ? this.sessionSerialize(ctx, ck) : null };
      }),
      // Séances pointées pour un enseignant qui n'est plus celui de l'emploi du temps (séance déplacée ou annulée après coup).
      orphelins: cks
        .filter((c) => !seances.some((s) => s.entryId === c.entryId))
        .map((c) => ({ teacherId: c.teacherId, teacherName: this.teacherName(byTeacher.get(c.teacherId)), ...this.sessionSerialize(ctx, c), heureDebut: c.heureDebut, heureFin: c.heureFin })),
      journees: [...journeeTeachers].map((teacherId) => {
        const ck = dayCks.find((d) => d.teacherId === teacherId);
        return {
          teacherId,
          teacherName: this.teacherName(byTeacher.get(teacherId)),
          prevue: resolved.seances.some((s) => s.teacherId === teacherId && s.statut !== 'ANNULEE'),
          pointage: ck ? this.daySerialize(ctx, ck) : null,
        };
      }),
    };
  }

  private teacherName(t: Teacher | undefined): string {
    return t ? `${t.prenom} ${t.nom}` : 'Enseignant';
  }

  /** RV06 : le validateur ne traite jamais un pointage dont il est l'enseignant. */
  private async assertNotSelf(actorId: string, teacherId: string) {
    const own = await this.prisma.teacher.findUnique({ where: { userId: actorId } });
    if (own && own.id === teacherId) {
      throw new ForbiddenException('Vous ne pouvez pas valider ni corriger votre propre pointage : un autre responsable doit le faire.');
    }
  }

  private async decide<T extends { statut: string; teacherId: string }>(
    entity: 'session' | 'day',
    id: string,
    dto: DecideCheckinDto,
    actorId: string,
  ) {
    const before = (
      entity === 'session'
        ? await this.prisma.teacherSessionCheckin.findUnique({ where: { id } })
        : await this.prisma.teacherDayCheckin.findUnique({ where: { id } })
    ) as T | null;
    if (!before) throw new NotFoundException('Pointage introuvable.');
    await this.assertNotSelf(actorId, before.teacherId);
    if (before.statut !== 'EN_ATTENTE') {
      throw new ConflictException('Ce pointage a déjà été traité. Pour le changer, saisissez une correction avec un motif.');
    }
    const motif = dto.motif?.trim() || null;
    if (dto.statut === 'REJETE' && !motif) {
      throw new UnprocessableEntityException('Un rejet exige un motif.');
    }
    const data = { statut: dto.statut, decidedById: actorId, decidedAt: new Date(), motif };
    const after =
      entity === 'session'
        ? await this.prisma.teacherSessionCheckin.update({ where: { id }, data })
        : await this.prisma.teacherDayCheckin.update({ where: { id }, data });
    await this.log(
      actorId,
      dto.statut === 'VALIDE' ? 'TEACHER_CHECKIN_VALIDATE' : 'TEACHER_CHECKIN_REJECT',
      entity === 'session' ? 'TeacherSessionCheckin' : 'TeacherDayCheckin',
      id,
      before.statut,
      { statut: dto.statut, motif },
    );
    return after;
  }

  decideSession(id: string, dto: DecideCheckinDto, actorId: string) {
    return this.decide('session', id, dto, actorId);
  }

  decideDay(id: string, dto: DecideCheckinDto, actorId: string) {
    return this.decide('day', id, dto, actorId);
  }

  /**
   * Pointage saisi ou corrigé par la vie scolaire (enseignant sans téléphone, scan oublié, erreur). Il est
   * validé d'office puisque c'est déjà un tiers qui le pose, avec un motif et une trace d'audit.
   */
  async manualSession(dto: ManualSessionDto, actorId: string) {
    const ctx = await this.context();
    if (dto.date > ctx.today) throw new UnprocessableEntityException("Impossible de pointer une séance qui n'a pas encore eu lieu.");
    if (dto.fin <= dto.debut) throw new BadRequestException("L'heure de fin doit suivre l'heure de début.");
    const resolved = await this.occurrences.resolveDay(dto.date);
    const seance = resolved.seances.find((s) => s.entryId === dto.entryId);
    if (!seance || seance.statut === 'ANNULEE') {
      throw new UnprocessableEntityException("Cette séance n'a pas lieu (ou est annulée) à cette date.");
    }
    const teacher = await this.prisma.teacher.findUnique({ where: { id: seance.teacherId } });
    if (!teacher) throw new NotFoundException('Enseignant introuvable.');
    if (teacher.modePointage !== 'SEANCE') {
      throw new UnprocessableEntityException("Cet enseignant pointe à l'arrivée et au départ : saisissez son pointage de journée.");
    }
    await this.assertNotSelf(actorId, teacher.id);

    const debutAt = localToInstant(dto.date, dto.debut, ctx.fuseauHoraire);
    const finAt = localToInstant(dto.date, dto.fin, ctx.fuseauHoraire);
    const startAt = localToInstant(dto.date, seance.heureDebut, ctx.fuseauHoraire);
    const now = new Date();
    const before = await this.prisma.teacherSessionCheckin.findUnique({
      where: { entryId_date: { entryId: dto.entryId, date: toDateOnly(dto.date) } },
    });
    const data = {
      debutAt,
      finAt,
      debutRecuAt: now,
      finRecuAt: now,
      retardMinutes: Math.max(0, minutesBetween(startAt, debutAt)),
      ecartSalle: false,
      source: 'MANUEL' as const,
      statut: 'VALIDE' as const,
      decidedById: actorId,
      decidedAt: now,
      motif: dto.motif.trim(),
    };
    const saved = await this.prisma.teacherSessionCheckin.upsert({
      where: { entryId_date: { entryId: dto.entryId, date: toDateOnly(dto.date) } },
      update: data,
      create: {
        ...data,
        teacherId: teacher.id,
        entryId: dto.entryId,
        date: toDateOnly(dto.date),
        classId: seance.classId,
        heureDebut: seance.heureDebut,
        heureFin: seance.heureFin,
      },
    });
    await this.log(actorId, 'TEACHER_CHECKIN_MANUAL', 'TeacherSessionCheckin', saved.id, before ? this.sessionSerialize(ctx, before) : null, {
      ...this.sessionSerialize(ctx, saved),
      teacher: this.teacherName(teacher),
    });
    return this.sessionSerialize(ctx, saved);
  }

  async manualDay(dto: ManualDayDto, actorId: string) {
    const ctx = await this.context();
    if (dto.date > ctx.today) throw new UnprocessableEntityException("Impossible de pointer un jour qui n'a pas encore eu lieu.");
    if (dto.depart && dto.depart <= dto.arrivee) throw new BadRequestException("L'heure de départ doit suivre l'heure d'arrivée.");
    const teacher = await this.prisma.teacher.findUnique({ where: { id: dto.teacherId } });
    if (!teacher) throw new NotFoundException('Enseignant introuvable.');
    if (teacher.modePointage !== 'JOURNEE') {
      throw new UnprocessableEntityException('Cet enseignant pointe séance par séance : saisissez le pointage de sa séance.');
    }
    await this.assertNotSelf(actorId, teacher.id);

    const resolved = await this.occurrences.resolveDay(dto.date, { teacherId: teacher.id });
    const first = resolved.seances.filter((s) => s.statut !== 'ANNULEE').sort((a, b) => a.heureDebut.localeCompare(b.heureDebut))[0];
    const arriveeAt = localToInstant(dto.date, dto.arrivee, ctx.fuseauHoraire);
    const now = new Date();
    const key = { teacherId_date: { teacherId: teacher.id, date: toDateOnly(dto.date) } };
    const before = await this.prisma.teacherDayCheckin.findUnique({ where: key });
    const data = {
      arriveeAt,
      departAt: dto.depart ? localToInstant(dto.date, dto.depart, ctx.fuseauHoraire) : null,
      arriveeRecuAt: now,
      departRecuAt: dto.depart ? now : null,
      heurePrevue: first?.heureDebut ?? null,
      retardMinutes: first ? Math.max(0, minutesBetween(localToInstant(dto.date, first.heureDebut, ctx.fuseauHoraire), arriveeAt)) : null,
      source: 'MANUEL' as const,
      statut: 'VALIDE' as const,
      decidedById: actorId,
      decidedAt: now,
      motif: dto.motif.trim(),
    };
    const saved = await this.prisma.teacherDayCheckin.upsert({
      where: key,
      update: data,
      create: { ...data, teacherId: teacher.id, date: toDateOnly(dto.date) },
    });
    await this.log(actorId, 'TEACHER_CHECKIN_MANUAL', 'TeacherDayCheckin', saved.id, before ? this.daySerialize(ctx, before) : null, {
      ...this.daySerialize(ctx, saved),
      teacher: this.teacherName(teacher),
    });
    return this.daySerialize(ctx, saved);
  }

  // ------------------------------------------------ Récapitulatif mensuel (RV07)

  /**
   * Heures effectuées d'un mois, calculées d'après les pointages **validés** et l'emploi du temps :
   * séances tenues (début et fin validés) et leur durée prévue pour les enseignants qui pointent par
   * séance ; jours de présence et heures entre arrivée et départ pour les autres. Un remplaçant est
   * crédité de la séance qu'il tient ; l'absent voit la séance comptée comme confiée à un remplaçant.
   */
  async summary(month: string, teacherId?: string) {
    const ctx = await this.context();
    const first = `${month}-01`;
    const days: string[] = [];
    for (let d = first; d.startsWith(month) && d <= ctx.today; d = addDays(d, 1)) days.push(d);

    const teachers = await this.prisma.teacher.findMany({
      where: { id: teacherId || undefined },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    const from = toDateOnly(first);
    const lastDay = addDays(days.length > 0 ? days[days.length - 1] : first, 0);
    const to = toDateOnly(lastDay);
    const [sessionCks, dayCks, replaced] = await Promise.all([
      this.prisma.teacherSessionCheckin.findMany({ where: { date: { gte: from, lte: to } } }),
      this.prisma.teacherDayCheckin.findMany({ where: { date: { gte: from, lte: to } } }),
      this.prisma.timetableException.findMany({
        where: { date: { gte: from, lte: to }, type: 'REMPLACEE' },
        include: { entry: { select: { teacherId: true } } },
      }),
    ]);

    // Séances prévues (enseignant effectif du jour) et jours prévus, par enseignant.
    const planned = new Map<string, Occurrence[]>();
    const plannedDays = new Map<string, Set<string>>();
    for (const day of days) {
      const resolved = await this.occurrences.resolveDay(day);
      for (const s of resolved.seances) {
        if (s.statut === 'ANNULEE') continue;
        if (!planned.has(s.teacherId)) planned.set(s.teacherId, []);
        planned.get(s.teacherId)!.push(s);
        if (!plannedDays.has(s.teacherId)) plannedDays.set(s.teacherId, new Set());
        plannedDays.get(s.teacherId)!.add(day);
      }
    }

    const tol = ctx.pointageToleranceMinutes;
    const rows = teachers.map((t) => {
      const base = {
        teacherId: t.id,
        enseignant: this.teacherName(t),
        mode: t.modePointage,
        statutFiche: t.statut,
        confieesARemplacant: replaced.filter((r) => r.entry.teacherId === t.id).length,
      };
      if (t.modePointage === 'JOURNEE') {
        const mine = dayCks.filter((d) => d.teacherId === t.id);
        const validated = mine.filter((d) => d.statut === 'VALIDE' && d.arriveeAt && d.departAt);
        const prevus = plannedDays.get(t.id) ?? new Set<string>();
        const pointed = new Set(mine.map((d) => isoDay(d.date)));
        return {
          ...base,
          joursPrevus: prevus.size,
          joursPresents: validated.length,
          joursEnAttente: mine.filter((d) => d.statut === 'EN_ATTENTE').length,
          joursRejetes: mine.filter((d) => d.statut === 'REJETE').length,
          // Validés mais sans départ pointé : leurs heures ne sont pas comptées tant que le départ manque.
          joursIncomplets: mine.filter((d) => d.statut === 'VALIDE' && (!d.arriveeAt || !d.departAt)).length,
          joursNonPointes: [...prevus].filter((d) => !pointed.has(d)).length,
          minutesEffectuees: validated.reduce((n, d) => n + Math.max(0, minutesBetween(d.arriveeAt!, d.departAt!)), 0),
          retards: validated.filter((d) => (d.retardMinutes ?? 0) > tol).length,
          minutesRetard: validated.reduce((n, d) => n + (d.retardMinutes ?? 0), 0),
        };
      }
      const seances = planned.get(t.id) ?? [];
      const mine = sessionCks.filter((c) => c.teacherId === t.id);
      const key = (entryId: string, date: string) => `${entryId}|${date}`;
      const ckByKey = new Map(mine.map((c) => [key(c.entryId, isoDay(c.date)), c]));
      let tenues = 0;
      let enAttente = 0;
      let rejetees = 0;
      let nonPointees = 0;
      let incompletes = 0;
      let minutes = 0;
      for (const s of seances) {
        const ck = ckByKey.get(key(s.entryId, s.date));
        if (!ck) nonPointees += 1;
        else if (ck.statut === 'EN_ATTENTE') enAttente += 1;
        else if (ck.statut === 'REJETE') rejetees += 1;
        else if (ck.debutAt && ck.finAt) {
          tenues += 1;
          minutes += plannedMinutes(s.heureDebut, s.heureFin);
        } else incompletes += 1;
      }
      const validated = mine.filter((c) => c.statut === 'VALIDE' && c.debutAt && c.finAt);
      return {
        ...base,
        seancesPrevues: seances.length,
        seancesTenues: tenues,
        seancesEnAttente: enAttente,
        seancesRejetees: rejetees,
        seancesIncompletes: incompletes,
        seancesNonPointees: nonPointees,
        minutesEffectuees: minutes,
        retards: validated.filter((c) => (c.retardMinutes ?? 0) > tol).length,
        minutesRetard: validated.reduce((n, c) => n + (c.retardMinutes ?? 0), 0),
      };
    });
    return {
      mois: month,
      jusquau: days.length > 0 ? days[days.length - 1] : null,
      toleranceRetardMinutes: tol,
      enseignants: rows.filter((r) => r.statutFiche === 'ACTIF' || ('seancesPrevues' in r ? r.seancesPrevues > 0 : r.joursPrevus > 0)),
    };
  }
}

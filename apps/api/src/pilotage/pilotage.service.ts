import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { OccurrencesService } from '../timetable/occurrences.service';
import { TeacherCheckinsService } from '../teacher-checkins/teacher-checkins.service';
import { addDays } from '../timetable/timetable.util';
import { isoDay, toDateOnly } from '../pedagogy/pedagogy.util';
import {
  dayInTimezone,
  justificationDeadline,
} from '../attendance/attendance.util';
import { timeInTimezone } from '../teacher-checkins/checkin.util';
import { toCsv, type CsvCellValue } from '../common/csv.util';

/** Plus longue période analysable d'un coup : au-delà, le calcul séance par séance devient trop lourd. */
export const MAX_PERIOD_DAYS = 92;

export type ExportKind =
  'assiduite-classes' | 'assiduite-jours' | 'enseignants' | 'alertes';
export const EXPORT_KINDS: ExportKind[] = [
  'assiduite-classes',
  'assiduite-jours',
  'enseignants',
  'alertes',
];

interface RawRow {
  date: Date;
  classId: string;
  statut: string;
  jstatut: string | null;
  n: number;
}

interface Counters {
  total: number;
  presents: number;
  retards: number;
  absents: number;
  justifiees: number;
  nonJustifiees: number;
  enAttente: number;
  delaiEnCours: number;
}

const emptyCounters = (): Counters => ({
  total: 0,
  presents: 0,
  retards: 0,
  absents: 0,
  justifiees: 0,
  nonJustifiees: 0,
  enAttente: 0,
  delaiEnCours: 0,
});

/** Pourcentage à une décimale, ou null quand il n'y a rien à comparer (jamais un « 0 % » trompeur). */
const pct = (n: number, d: number): number | null =>
  d > 0 ? Math.round((n / d) * 1000) / 10 : null;

/**
 * Tableau de bord de la Direction (Lot 14). Règle d'or : **aucun indicateur n'est saisi ni stocké**, tout est
 * recalculé à chaque demande depuis les données sources (appels, justificatifs, pointages, emploi du temps).
 * Les seuils viennent des paramètres de l'école ; le seuil d'alerte de décrochage n'a AUCUNE valeur par défaut
 * (D61) : sans seuil fixé par la Direction, les alertes sont désactivées.
 */
@Injectable()
export class PilotageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
    private readonly occurrences: OccurrencesService,
    private readonly checkins: TeacherCheckinsService,
  ) {}

  private async context() {
    const school = await this.prisma.school.findFirstOrThrow({
      select: {
        fuseauHoraire: true,
        retardMaxMinutes: true,
        delaiJustificatifJours: true,
        joursClasse: true,
        pointageToleranceMinutes: true,
        seuilAlerteAbsences: true,
      },
    });
    return {
      ...school,
      today: dayInTimezone(new Date(), school.fuseauHoraire),
    };
  }

  /** Période demandée : par défaut le mois en cours jusqu'à aujourd'hui ; jamais dans le futur, jamais trop longue. */
  private period(ctx: { today: string }, from?: string, to?: string) {
    const end = to ?? ctx.today;
    const start = from ?? `${ctx.today.slice(0, 8)}01`;
    if (start > end)
      throw new BadRequestException(
        'La date de début doit précéder la date de fin.',
      );
    const days =
      Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
    if (days > MAX_PERIOD_DAYS) {
      throw new BadRequestException(
        `La période est trop longue (${days} jours) : choisissez au plus ${MAX_PERIOD_DAYS} jours.`,
      );
    }
    return { from: start, to: end, days };
  }

  // ------------------------------------------------------------------------------------- Assiduité

  private async attendanceRows(from: string, to: string, classId?: string) {
    return this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT c."date" AS "date", c."classId" AS "classId", r."statut"::text AS "statut", j."statut"::text AS "jstatut", COUNT(*)::int AS "n"
      FROM attendance_records r
      JOIN attendance_calls c ON c."id" = r."callId"
      LEFT JOIN absence_justifications j ON j."recordId" = r."id"
      WHERE c."date" >= ${toDateOnly(from)} AND c."date" <= ${toDateOnly(to)}
      ${classId ? Prisma.sql`AND c."classId" = ${classId}` : Prisma.empty}
      GROUP BY c."date", c."classId", r."statut", j."statut"`);
  }

  /** Fin du délai de justification pour chaque jour d'absence de la période (D58, jours de classe hors fermetures). */
  private async deadlines(
    ctx: { joursClasse: number[]; delaiJustificatifJours: number },
    from: string,
  ) {
    const events = await this.prisma.calendarEvent.findMany({
      where: { dateFin: { gte: toDateOnly(from) } },
      select: { dateDebut: true, dateFin: true },
    });
    const closures = events.map((e) => ({
      debut: isoDay(e.dateDebut),
      fin: isoDay(e.dateFin),
    }));
    const cache = new Map<string, string>();
    return (day: string) => {
      if (!cache.has(day))
        cache.set(
          day,
          justificationDeadline(
            day,
            ctx.delaiJustificatifJours,
            ctx.joursClasse,
            closures,
          ),
        );
      return cache.get(day)!;
    };
  }

  /**
   * Une absence est justifiée (acceptée), refusée, en attente de décision, dans le délai pour être justifiée
   * (personne ne l'a encore fait mais c'est encore possible), ou non justifiée (délai dépassé sans justificatif).
   */
  private classify(
    statut: string,
    jstatut: string | null,
    day: string,
    today: string,
    deadline: (d: string) => string,
  ) {
    if (statut === 'PRESENT') return 'presents' as const;
    if (statut === 'RETARD') return 'retards' as const;
    if (jstatut === 'ACCEPTEE') return 'justifiees' as const;
    if (jstatut === 'REFUSEE') return 'nonJustifiees' as const;
    if (jstatut === 'EN_ATTENTE') return 'enAttente' as const;
    return today > deadline(day)
      ? ('nonJustifiees' as const)
      : ('delaiEnCours' as const);
  }

  private add(
    c: Counters,
    kind: ReturnType<PilotageService['classify']>,
    n: number,
  ) {
    c.total += n;
    c[kind] += n;
    if (kind !== 'presents' && kind !== 'retards') c.absents += n;
  }

  private rates(c: Counters) {
    return {
      ...c,
      tauxPresence: pct(c.presents + c.retards, c.total),
      tauxAbsence: pct(c.absents, c.total),
      tauxRetard: pct(c.retards, c.total),
    };
  }

  private async attendance(
    ctx: Awaited<ReturnType<PilotageService['context']>>,
    from: string,
    to: string,
    classId?: string,
  ) {
    const [rows, deadline, classes, calls] = await Promise.all([
      this.attendanceRows(from, to, classId),
      this.deadlines(ctx, from),
      this.prisma.class.findMany({ select: { id: true, nom: true } }),
      this.prisma.attendanceCall.count({
        where: {
          date: { gte: toDateOnly(from), lte: toDateOnly(to) },
          classId,
        },
      }),
    ]);
    const total = emptyCounters();
    const byClass = new Map<string, Counters>();
    const byDay = new Map<string, Counters>();
    for (const r of rows) {
      const day = isoDay(r.date);
      const kind = this.classify(r.statut, r.jstatut, day, ctx.today, deadline);
      this.add(total, kind, r.n);
      this.add(
        byClass.get(r.classId) ??
          byClass.set(r.classId, emptyCounters()).get(r.classId)!,
        kind,
        r.n,
      );
      this.add(
        byDay.get(day) ?? byDay.set(day, emptyCounters()).get(day)!,
        kind,
        r.n,
      );
    }
    const nameOf = new Map(classes.map((c) => [c.id, c.nom]));
    return {
      totaux: { ...this.rates(total), appelsEffectues: calls },
      parClasse: [...byClass.entries()]
        .map(([id, c]) => ({
          classId: id,
          classe: nameOf.get(id) ?? '?',
          ...this.rates(c),
        }))
        .sort(
          (a, b) =>
            (b.tauxAbsence ?? -1) - (a.tauxAbsence ?? -1) ||
            a.classe.localeCompare(b.classe),
        ),
      parJour: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, c]) => ({ date, ...this.rates(c) })),
    };
  }

  /** Séances qui auraient dû faire l'objet d'un appel et qui n'en ont pas : couverture de l'appel. */
  private async missingCalls(
    ctx: Awaited<ReturnType<PilotageService['context']>>,
    from: string,
    to: string,
    classId?: string,
  ) {
    const nowTime = timeInTimezone(new Date(), ctx.fuseauHoraire);
    const done = await this.prisma.attendanceCall.findMany({
      where: { date: { gte: toDateOnly(from), lte: toDateOnly(to) }, classId },
      select: { entryId: true, date: true },
    });
    const doneKeys = new Set(done.map((c) => `${c.entryId}|${isoDay(c.date)}`));
    let prevues = 0;
    const manquants: Array<{
      date: string;
      classe: string;
      matiere: string;
      heureDebut: string;
      enseignant: string;
    }> = [];
    for (let day = from; day <= to && day <= ctx.today; day = addDays(day, 1)) {
      const resolved = await this.occurrences.resolveDay(day, { classId });
      for (const s of resolved.seances) {
        if (s.statut === 'ANNULEE') continue;
        // Aujourd'hui, une séance qui n'a pas encore commencé n'est pas « manquante ».
        if (day === ctx.today && s.heureDebut > nowTime) continue;
        prevues += 1;
        if (!doneKeys.has(`${s.entryId}|${day}`)) {
          manquants.push({
            date: day,
            classe: s.className,
            matiere: s.subjectName,
            heureDebut: s.heureDebut,
            enseignant: s.teacherName,
          });
        }
      }
    }
    return {
      prevues,
      effectuees: prevues - manquants.length,
      manquants: manquants.length,
      tauxCouverture: pct(prevues - manquants.length, prevues),
      // Les plus anciens d'abord seraient les moins actionnables : on montre les plus récents.
      dernieres: manquants.slice(-30).reverse(),
    };
  }

  // ---------------------------------------------------------------------------- Ponctualité enseignants

  private async teachers(from: string, to: string) {
    const summary = await this.checkins.summaryRange(from, to);
    const lignes = summary.enseignants
      .map((r) => {
        const isDay = 'joursPrevus' in r;
        const prevues = isDay ? r.joursPrevus : r.seancesPrevues;
        const tenues = isDay ? r.joursPresents : r.seancesTenues;
        return {
          teacherId: r.teacherId,
          enseignant: r.enseignant,
          mode: r.mode,
          unite: isDay ? 'jours' : 'séances',
          prevues,
          tenues,
          enAttente: isDay ? r.joursEnAttente : r.seancesEnAttente,
          nonPointees: isDay ? r.joursNonPointes : r.seancesNonPointees,
          retards: r.retards,
          minutesRetard: r.minutesRetard,
          minutesEffectuees: r.minutesEffectuees,
          confieesARemplacant: r.confieesARemplacant,
          tauxPresence: pct(tenues, prevues),
          tauxPonctualite:
            tenues > 0 ? pct(Math.max(0, tenues - r.retards), tenues) : null,
        };
      })
      .filter((l) => l.prevues > 0)
      .sort(
        (a, b) =>
          (a.tauxPonctualite ?? 101) - (b.tauxPonctualite ?? 101) ||
          a.enseignant.localeCompare(b.enseignant),
      );
    const sum = (f: (l: (typeof lignes)[number]) => number) =>
      lignes.reduce((n, l) => n + f(l), 0);
    const prevues = sum((l) => l.prevues);
    const tenues = sum((l) => l.tenues);
    const retards = sum((l) => l.retards);
    return {
      toleranceRetardMinutes: summary.toleranceRetardMinutes,
      jusquau: summary.jusquau,
      totaux: {
        // Séances pour les enseignants qui pointent par séance, jours pour les autres : on additionne des « pointages attendus ».
        pointagesPrevus: prevues,
        pointagesTenus: tenues,
        nonPointes: sum((l) => l.nonPointees),
        enAttenteDeValidation: sum((l) => l.enAttente),
        retards,
        minutesRetard: sum((l) => l.minutesRetard),
        heuresEffectuees:
          Math.round((sum((l) => l.minutesEffectuees) / 60) * 10) / 10,
        seancesConfieesARemplacant: sum((l) => l.confieesARemplacant),
        tauxPresence: pct(tenues, prevues),
        tauxPonctualite:
          tenues > 0 ? pct(Math.max(0, tenues - retards), tenues) : null,
      },
      lignes,
    };
  }

  // ------------------------------------------------------------------------- Alertes de décrochage

  private async alerts(
    ctx: Awaited<ReturnType<PilotageService['context']>>,
    from: string,
    to: string,
    classId?: string,
  ) {
    const seuil = ctx.seuilAlerteAbsences;
    if (seuil === null)
      return {
        actives: false,
        seuil: null as number | null,
        eleves: [] as AlertRow[],
      };
    const [rows, deadline] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          studentId: string;
          date: Date;
          statut: string;
          jstatut: string | null;
          n: number;
        }>
      >(Prisma.sql`
        SELECT r."studentId" AS "studentId", c."date" AS "date", r."statut"::text AS "statut", j."statut"::text AS "jstatut", COUNT(*)::int AS "n"
        FROM attendance_records r
        JOIN attendance_calls c ON c."id" = r."callId"
        LEFT JOIN absence_justifications j ON j."recordId" = r."id"
        WHERE r."statut" IN ('ABSENT', 'RETARD')
          AND c."date" >= ${toDateOnly(from)} AND c."date" <= ${toDateOnly(to)}
          ${classId ? Prisma.sql`AND c."classId" = ${classId}` : Prisma.empty}
        GROUP BY r."studentId", c."date", r."statut", j."statut"`),
      this.deadlines(ctx, from),
    ]);
    const perStudent = new Map<
      string,
      {
        nonJustifiees: number;
        enAttente: number;
        delaiEnCours: number;
        justifiees: number;
        retards: number;
        derniere: string;
      }
    >();
    for (const r of rows) {
      const day = isoDay(r.date);
      const kind = this.classify(r.statut, r.jstatut, day, ctx.today, deadline);
      const s = perStudent.get(r.studentId) ?? {
        nonJustifiees: 0,
        enAttente: 0,
        delaiEnCours: 0,
        justifiees: 0,
        retards: 0,
        derniere: '',
      };
      if (kind === 'retards') s.retards += r.n;
      else if (kind === 'presents') continue;
      else s[kind] += r.n;
      if (kind !== 'retards' && day > s.derniere) s.derniere = day;
      perStudent.set(r.studentId, s);
    }
    const flagged = [...perStudent.entries()].filter(
      ([, s]) => s.nonJustifiees >= seuil,
    );
    const students = await this.prisma.student.findMany({
      where: { id: { in: flagged.map(([id]) => id) } },
      select: {
        id: true,
        nom: true,
        prenom: true,
        matricule: true,
        enrollments: {
          where: { statut: 'ACTIVE' },
          orderBy: { academicYear: { dateDebut: 'desc' } },
          take: 1,
          select: { class: { select: { nom: true } } },
        },
      },
    });
    const info = new Map(students.map((s) => [s.id, s]));
    const eleves = flagged
      .map(([id, s]): AlertRow => {
        const st = info.get(id);
        return {
          studentId: id,
          eleve: st ? `${st.prenom} ${st.nom}` : '?',
          matricule: st?.matricule ?? '',
          classe: st?.enrollments[0]?.class.nom ?? null,
          nonJustifiees: s.nonJustifiees,
          enAttente: s.enAttente,
          delaiEnCours: s.delaiEnCours,
          retards: s.retards,
          derniereAbsence: s.derniere || null,
        };
      })
      .sort(
        (a, b) =>
          b.nonJustifiees - a.nonJustifiees || a.eleve.localeCompare(b.eleve),
      );
    return { actives: true, seuil, eleves };
  }

  // ---------------------------------------------------------------------------------- Point d'entrée

  async dashboard(from?: string, to?: string, classId?: string) {
    const ctx = await this.context();
    const p = this.period(ctx, from, to);
    if (classId) {
      const exists = await this.prisma.class.findUnique({
        where: { id: classId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Classe introuvable.');
    }
    const [assiduite, appels, enseignants, alertes] = await Promise.all([
      this.attendance(ctx, p.from, p.to, classId),
      this.missingCalls(ctx, p.from, p.to, classId),
      this.teachers(p.from, p.to),
      this.alerts(ctx, p.from, p.to, classId),
    ]);
    return {
      periode: { ...p, aujourdhui: ctx.today, classId: classId ?? null },
      // Les seuils qui ont servi au calcul, pour que la Direction sache ce qu'elle regarde.
      parametres: {
        retardMaxMinutes: ctx.retardMaxMinutes,
        delaiJustificatifJours: ctx.delaiJustificatifJours,
        toleranceRetardEnseignantMinutes: ctx.pointageToleranceMinutes,
        seuilAlerteAbsences: ctx.seuilAlerteAbsences,
      },
      assiduite: { ...assiduite, appels },
      enseignants,
      alertes,
    };
  }

  // -------------------------------------------------------------------------------------- Exports

  async exportCsv(
    kind: ExportKind,
    userId: string,
    from?: string,
    to?: string,
    classId?: string,
  ) {
    const d = await this.dashboard(from, to, classId);
    let csv: string;
    if (kind === 'assiduite-classes' || kind === 'assiduite-jours') {
      const isClass = kind === 'assiduite-classes';
      const rows = (
        isClass ? d.assiduite.parClasse : d.assiduite.parJour
      ) as Array<Record<string, CsvCellValue>>;
      csv = toCsv(rows, [
        isClass
          ? { key: 'classe', label: 'Classe' }
          : { key: 'date', label: 'Date' },
        { key: 'total', label: 'Présences saisies' },
        { key: 'presents', label: 'Présents' },
        { key: 'retards', label: 'Retards' },
        { key: 'absents', label: 'Absents' },
        { key: 'justifiees', label: 'Absences justifiées' },
        { key: 'nonJustifiees', label: 'Absences non justifiées' },
        { key: 'enAttente', label: 'En attente de décision' },
        { key: 'delaiEnCours', label: 'Délai de justification en cours' },
        { key: 'tauxPresence', label: 'Taux de présence (%)' },
        { key: 'tauxAbsence', label: "Taux d'absence (%)" },
      ]);
    } else if (kind === 'enseignants') {
      csv = toCsv(
        d.enseignants.lignes as unknown as Array<Record<string, CsvCellValue>>,
        [
          { key: 'enseignant', label: 'Enseignant' },
          { key: 'unite', label: 'Unité' },
          { key: 'prevues', label: 'Prévues' },
          { key: 'tenues', label: 'Tenues' },
          { key: 'enAttente', label: 'En attente de validation' },
          { key: 'nonPointees', label: 'Non pointées' },
          { key: 'retards', label: 'Retards' },
          { key: 'minutesRetard', label: 'Minutes de retard' },
          { key: 'minutesEffectuees', label: 'Minutes effectuées' },
          { key: 'tauxPresence', label: 'Taux de présence (%)' },
          { key: 'tauxPonctualite', label: 'Taux de ponctualité (%)' },
        ],
      );
    } else {
      if (!d.alertes.actives) {
        throw new ConflictException(
          "Les alertes sont désactivées : fixez d'abord un seuil d'absences non justifiées dans les paramètres de la vie scolaire.",
        );
      }
      csv = toCsv(
        d.alertes.eleves as unknown as Array<Record<string, CsvCellValue>>,
        [
          { key: 'eleve', label: 'Élève' },
          { key: 'matricule', label: 'Matricule' },
          { key: 'classe', label: 'Classe' },
          { key: 'nonJustifiees', label: 'Absences non justifiées' },
          { key: 'enAttente', label: 'En attente de décision' },
          { key: 'delaiEnCours', label: 'Délai en cours' },
          { key: 'retards', label: 'Retards' },
          { key: 'derniereAbsence', label: 'Dernière absence' },
        ],
      );
    }
    // Une liste nominative de mineurs sort de l'application : l'export est journalisé (RV11, RV12).
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action: 'PILOTAGE_EXPORT',
      entite: 'Pilotage',
      entiteId: kind,
      ancienneValeur: null,
      nouvelleValeur: {
        kind,
        from: d.periode.from,
        to: d.periode.to,
        classId: classId ?? null,
      },
    });
    return {
      csv,
      filename: `pilotage-${kind}-${d.periode.from}-${d.periode.to}.csv`,
    };
  }
}

export interface AlertRow {
  studentId: string;
  eleve: string;
  matricule: string;
  classe: string | null;
  nonJustifiees: number;
  enAttente: number;
  delaiEnCours: number;
  retards: number;
  derniereAbsence: string | null;
}

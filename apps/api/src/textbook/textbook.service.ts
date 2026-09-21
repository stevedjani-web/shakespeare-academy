import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dayInTimezone } from '../attendance/attendance.util';
import { isoDay, toDateOnly } from '../pedagogy/pedagogy.util';
import type { CurrentUserData } from '../auth/types/current-user.interface';
import {
  CreateTextbookEntryDto,
  UpdateTextbookEntryDto,
} from './dto/textbook.dto';

/** Fenêtre par défaut de la liste : les 30 derniers jours. */
const DEFAULT_LIST_DAYS = 30;
/** Fenêtre par défaut du portail parent : les 14 derniers jours, plus les devoirs encore à rendre. */
const PARENT_PAST_DAYS = 14;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Cahier de textes (Lot 16) : ce qui a été fait en cours et le travail à faire, pour une classe, une matière et un
 * jour. Texte seul. L'enseignant écrit pour SES couples classe-matière ; il lit toutes les matières des classes où il
 * enseigne ; la vie scolaire, la Direction et l'Administrateur lisent toute l'école (TEXTBOOK_READ). Les parents voient
 * le cahier de la classe de leur enfant, en lecture seule, dès l'enregistrement.
 */
@Injectable()
export class TextbookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
    private readonly notifications: NotificationsService,
  ) {}

  private async log(
    userId: string,
    action: string,
    entiteId: string,
    nouvelleValeur?: unknown,
  ) {
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action,
      entite: 'TextbookEntry',
      entiteId,
      nouvelleValeur,
    });
  }

  private async today(): Promise<string> {
    const school = await this.prisma.school.findFirstOrThrow({
      select: { fuseauHoraire: true },
    });
    return dayInTimezone(new Date(), school.fuseauHoraire);
  }

  // ---------------------------------------------------------------------------------------------- Portée

  private async teacherOf(user: CurrentUserData) {
    return this.prisma.teacher.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
  }

  /**
   * Classes que le compte peut lire : `null` = toute l'école (TEXTBOOK_READ). Un enseignant lit les classes où il a au
   * moins une affectation, pour toutes les matières (charge de travail des élèves).
   */
  private async readableClassIds(
    user: CurrentUserData,
  ): Promise<string[] | null> {
    if (user.permissions.includes('TEXTBOOK_READ')) return null;
    const teacher = await this.teacherOf(user);
    if (!teacher) {
      throw new ForbiddenException(
        "Votre compte n'est relié à aucune fiche enseignant : le cahier de textes n'est pas accessible.",
      );
    }
    const rows = await this.prisma.teachingAssignment.findMany({
      where: { teacherId: teacher.id },
      select: { classId: true },
    });
    return [...new Set(rows.map((r) => r.classId))];
  }

  /** Écrire n'est permis que pour un couple classe-matière dont on est titulaire (sauf droit de lecture générale). */
  private async assertCanWrite(
    user: CurrentUserData,
    classId: string,
    subjectId: string,
  ) {
    if (!user.permissions.includes('TEXTBOOK_WRITE')) {
      throw new ForbiddenException(
        "Vous n'avez pas le droit de renseigner le cahier de textes.",
      );
    }
    const assignment = await this.prisma.teachingAssignment.findUnique({
      where: { classId_subjectId: { classId, subjectId } },
    });
    if (!assignment) {
      throw new UnprocessableEntityException(
        "Aucun enseignant n'est affecté à cette matière dans cette classe.",
      );
    }
    if (!user.permissions.includes('TEXTBOOK_READ')) {
      const teacher = await this.teacherOf(user);
      if (!teacher) {
        throw new ForbiddenException(
          "Votre compte n'est relié à aucune fiche enseignant : le cahier de textes n'est pas accessible.",
        );
      }
      if (assignment.teacherId !== teacher.id) {
        throw new ForbiddenException(
          "Cette matière n'est pas la vôtre dans cette classe : vous ne pouvez pas renseigner son cahier.",
        );
      }
    }
    return assignment;
  }

  // ---------------------------------------------------------------------------------------------- Contexte

  async context(user: CurrentUserData) {
    const classIds = await this.readableClassIds(user);
    const year = await this.prisma.academicYear.findFirst({
      where: { statut: 'ACTIVE' },
    });
    const canWrite = user.permissions.includes('TEXTBOOK_WRITE');
    if (!year)
      return {
        annee: null,
        classes: [],
        affectations: [],
        peutEcrire: canWrite,
        aujourdhui: await this.today(),
      };

    const teacher =
      canWrite && !user.permissions.includes('TEXTBOOK_READ')
        ? await this.teacherOf(user)
        : null;
    const [classes, assignments] = await Promise.all([
      this.prisma.class.findMany({
        where: {
          academicYearId: year.id,
          ...(classIds ? { id: { in: classIds } } : {}),
        },
        orderBy: [{ level: { ordre: 'asc' } }, { nom: 'asc' }],
      }),
      this.prisma.teachingAssignment.findMany({
        where: {
          class: { academicYearId: year.id },
          ...(classIds ? { classId: { in: classIds } } : {}),
          // Les matières proposées à l'écriture : les siennes pour un enseignant, toutes sinon.
          ...(teacher ? { teacherId: teacher.id } : {}),
        },
        include: { class: true, subject: true },
      }),
    ]);
    return {
      annee: {
        id: year.id,
        libelle: year.libelle,
        dateDebut: isoDay(year.dateDebut),
        dateFin: isoDay(year.dateFin),
      },
      classes: classes.map((c) => ({ id: c.id, nom: c.nom })),
      affectations: assignments
        .map((a) => ({
          classId: a.classId,
          className: a.class.nom,
          subjectId: a.subjectId,
          subjectName: a.subject.nom,
        }))
        .sort(
          (a, b) =>
            a.className.localeCompare(b.className, 'fr') ||
            a.subjectName.localeCompare(b.subjectName, 'fr'),
        ),
      peutEcrire: canWrite,
      aujourdhui: await this.today(),
    };
  }

  // ---------------------------------------------------------------------------------------------- Liste

  async list(
    user: CurrentUserData,
    q: { classId?: string; subjectId?: string; from?: string; to?: string },
  ) {
    const classIds = await this.readableClassIds(user);
    if (q.classId && classIds && !classIds.includes(q.classId)) {
      throw new ForbiddenException(
        "Vous n'enseignez pas dans cette classe : son cahier de textes ne vous est pas accessible.",
      );
    }
    const today = await this.today();
    const from = q.from ?? addDays(today, -DEFAULT_LIST_DAYS);
    const rows = await this.prisma.textbookEntry.findMany({
      where: {
        ...(q.classId
          ? { classId: q.classId }
          : classIds
            ? { classId: { in: classIds } }
            : {}),
        ...(q.subjectId ? { subjectId: q.subjectId } : {}),
        date: {
          gte: toDateOnly(from),
          ...(q.to ? { lte: toDateOnly(q.to) } : {}),
        },
      },
      include: { class: true, subject: true, teacher: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map((e) => this.toRow(e, user));
  }

  private toRow(
    e: {
      id: string;
      classId: string;
      subjectId: string;
      date: Date;
      contenu: string | null;
      devoirs: string | null;
      dateEcheance: Date | null;
      createdById: string;
      class: { nom: string };
      subject: { nom: string };
      teacher: { prenom: string; nom: string };
    },
    user: CurrentUserData,
  ) {
    return {
      id: e.id,
      classId: e.classId,
      className: e.class.nom,
      subjectId: e.subjectId,
      subjectName: e.subject.nom,
      teacherName: `${e.teacher.prenom} ${e.teacher.nom}`,
      date: isoDay(e.date),
      contenu: e.contenu,
      devoirs: e.devoirs,
      dateEcheance: e.dateEcheance ? isoDay(e.dateEcheance) : null,
      // Seul l'auteur modifie ou supprime son entrée.
      modifiable:
        e.createdById === user.id &&
        user.permissions.includes('TEXTBOOK_WRITE'),
    };
  }

  // ---------------------------------------------------------------------------------------------- Écriture

  private clean(text: string | undefined | null): string | null {
    const value = text?.trim();
    return value ? value : null;
  }

  private async assertDates(
    classId: string,
    date: string,
    dateEcheance: string | null,
  ) {
    const klass = await this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      include: { academicYear: true },
    });
    if (klass.academicYear.statut === 'CLOTUREE') {
      throw new ConflictException(
        "L'année scolaire est clôturée : le cahier de textes n'est plus modifiable.",
      );
    }
    if (klass.academicYear.statut !== 'ACTIVE') {
      throw new ConflictException(
        "Le cahier de textes se renseigne dans l'année scolaire active.",
      );
    }
    const start = isoDay(klass.academicYear.dateDebut);
    const end = isoDay(klass.academicYear.dateFin);
    if (date < start || date > end) {
      throw new UnprocessableEntityException(
        `La date doit être dans l'année scolaire (du ${start} au ${end}).`,
      );
    }
    if (date > (await this.today())) {
      throw new UnprocessableEntityException(
        "Le cahier de textes ne se renseigne pas à l'avance : la date d'une séance ne peut pas être dans le futur.",
      );
    }
    if (dateEcheance && dateEcheance < date) {
      throw new UnprocessableEntityException(
        "L'échéance d'un devoir ne peut pas être avant la date de la séance.",
      );
    }
  }

  async create(dto: CreateTextbookEntryDto, user: CurrentUserData) {
    const assignment = await this.assertCanWrite(
      user,
      dto.classId,
      dto.subjectId,
    );
    const contenu = this.clean(dto.contenu);
    const devoirs = this.clean(dto.devoirs);
    if (!contenu && !devoirs) {
      throw new UnprocessableEntityException(
        'Indiquez ce qui a été fait en cours ou le travail à faire.',
      );
    }
    const dateEcheance = devoirs ? (dto.dateEcheance ?? null) : null;
    await this.assertDates(dto.classId, dto.date, dateEcheance);

    const entry = await this.prisma.textbookEntry.create({
      data: {
        classId: dto.classId,
        subjectId: dto.subjectId,
        teacherId: assignment.teacherId,
        date: toDateOnly(dto.date),
        contenu,
        devoirs,
        dateEcheance: dateEcheance ? toDateOnly(dateEcheance) : null,
        createdById: user.id,
      },
      include: { subject: true },
    });
    // Jamais le texte dans le journal : les identifiants et la présence de devoirs suffisent.
    await this.log(user.id, 'TEXTBOOK_CREATE', entry.id, {
      classId: dto.classId,
      subjectId: dto.subjectId,
      date: dto.date,
      aDevoirs: devoirs !== null,
    });
    // Alerte générique, jamais bloquante : seulement pour un devoir encore à rendre.
    if (devoirs && (!dateEcheance || dateEcheance >= (await this.today()))) {
      await this.notifications.notifyHomework(
        dto.classId,
        entry.subject.nom,
        dateEcheance,
      );
    }
    return this.one(entry.id, user);
  }

  private async one(id: string, user: CurrentUserData) {
    const e = await this.prisma.textbookEntry.findUniqueOrThrow({
      where: { id },
      include: { class: true, subject: true, teacher: true },
    });
    return this.toRow(e, user);
  }

  private async loadOwn(id: string, user: CurrentUserData) {
    const entry = await this.prisma.textbookEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Entrée introuvable.');
    if (!user.permissions.includes('TEXTBOOK_WRITE')) {
      throw new ForbiddenException(
        "Vous n'avez pas le droit de modifier le cahier de textes.",
      );
    }
    if (entry.createdById !== user.id) {
      throw new ForbiddenException(
        "Seul l'auteur d'une entrée peut la modifier ou la supprimer.",
      );
    }
    return entry;
  }

  async update(id: string, dto: UpdateTextbookEntryDto, user: CurrentUserData) {
    const before = await this.loadOwn(id, user);
    const contenu =
      dto.contenu !== undefined ? this.clean(dto.contenu) : before.contenu;
    const devoirs =
      dto.devoirs !== undefined ? this.clean(dto.devoirs) : before.devoirs;
    if (!contenu && !devoirs) {
      throw new UnprocessableEntityException(
        'Indiquez ce qui a été fait en cours ou le travail à faire.',
      );
    }
    const date = dto.date ?? isoDay(before.date);
    let dateEcheance: string | null =
      dto.dateEcheance !== undefined
        ? this.clean(dto.dateEcheance)
        : before.dateEcheance
          ? isoDay(before.dateEcheance)
          : null;
    if (!devoirs) dateEcheance = null;
    await this.assertDates(before.classId, date, dateEcheance);

    await this.prisma.textbookEntry.update({
      where: { id },
      data: {
        date: toDateOnly(date),
        contenu,
        devoirs,
        dateEcheance: dateEcheance ? toDateOnly(dateEcheance) : null,
      },
    });
    const changed = (
      ['date', 'contenu', 'devoirs', 'dateEcheance'] as const
    ).filter((k) => dto[k] !== undefined);
    await this.log(user.id, 'TEXTBOOK_UPDATE', id, { champs: changed });
    return this.one(id, user);
  }

  async remove(id: string, user: CurrentUserData) {
    const before = await this.loadOwn(id, user);
    const klass = await this.prisma.class.findUniqueOrThrow({
      where: { id: before.classId },
      include: { academicYear: true },
    });
    if (klass.academicYear.statut === 'CLOTUREE') {
      throw new ConflictException(
        "L'année scolaire est clôturée : le cahier de textes n'est plus modifiable.",
      );
    }
    await this.prisma.textbookEntry.delete({ where: { id } });
    await this.log(user.id, 'TEXTBOOK_DELETE', id, {
      classId: before.classId,
      subjectId: before.subjectId,
      date: isoDay(before.date),
    });
    return { id };
  }

  // ---------------------------------------------------------------------------------------------- Parents

  /**
   * Le cahier de la classe ACTUELLE d'un enfant (le contrôle d'accès à l'enfant est fait par le portail avant cet appel) :
   * les devoirs encore à rendre d'abord, puis les entrées des 14 derniers jours. Jamais une autre classe.
   */
  async forStudent(studentId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, statut: 'ACTIVE' },
      orderBy: { academicYear: { dateDebut: 'desc' } },
      include: { class: true },
    });
    if (!enrollment) return { classe: null, aVenir: [], entrees: [] };
    const today = await this.today();
    const rows = await this.prisma.textbookEntry.findMany({
      where: {
        classId: enrollment.classId,
        OR: [
          { date: { gte: toDateOnly(addDays(today, -PARENT_PAST_DAYS)) } },
          { dateEcheance: { gte: toDateOnly(today) } },
        ],
      },
      include: { subject: true, teacher: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    const shape = (e: (typeof rows)[number]) => ({
      id: e.id,
      date: isoDay(e.date),
      matiere: e.subject.nom,
      enseignant: `${e.teacher.prenom} ${e.teacher.nom}`,
      contenu: e.contenu,
      devoirs: e.devoirs,
      dateEcheance: e.dateEcheance ? isoDay(e.dateEcheance) : null,
    });
    const entries = rows.map(shape);
    return {
      classe: enrollment.class.nom,
      aujourdhui: today,
      // Devoirs encore à rendre : ceux dont l'échéance n'est pas passée, du plus proche au plus lointain.
      aVenir: entries
        .filter((e) => e.devoirs && e.dateEcheance && e.dateEcheance >= today)
        .sort((a, b) =>
          (a.dateEcheance as string).localeCompare(b.dateEcheance as string),
        ),
      entrees: entries.filter(
        (e) => e.date >= addDays(today, -PARENT_PAST_DAYS),
      ),
    };
  }
}

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
import { isoDay, toDateOnly } from '../pedagogy/pedagogy.util';
import type { CurrentUserData } from '../auth/types/current-user.interface';
import { GradeResultsService } from './grade-results.service';
import {
  CreateEvaluationDto,
  SaveAppreciationsDto,
  SaveNotesDto,
  UpdateEvaluationDto,
} from './dto/grades.dto';

/**
 * Portée d'un compte sur les notes : `null` = toute l'école (GRADE_READ : Direction, Administrateur) ; sinon
 * uniquement les couples classe-matière dont l'enseignant est titulaire (RV12 : un enseignant ne voit pas les notes
 * des autres classes).
 */
export type GradeScope = { teacherId: string } | null;

type Pair = { classId: string; subjectId: string };

@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
    private readonly results: GradeResultsService,
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

  // ---------------------------------------------------------------------------------------------- Portée

  async scopeOf(user: CurrentUserData): Promise<GradeScope> {
    if (user.permissions.includes('GRADE_READ')) return null;
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!teacher) {
      throw new ForbiddenException(
        "Votre compte n'est relié à aucune fiche enseignant : les notes ne sont pas accessibles.",
      );
    }
    return { teacherId: teacher.id };
  }

  /** Couples classe-matière accessibles : `null` = tous. */
  private async allowedPairs(scope: GradeScope): Promise<Pair[] | null> {
    if (!scope) return null;
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { teacherId: scope.teacherId },
      select: { classId: true, subjectId: true },
    });
    return assignments;
  }

  private async assertPair(
    scope: GradeScope,
    classId: string,
    subjectId: string,
  ) {
    if (!scope) return;
    const assignment = await this.prisma.teachingAssignment.findUnique({
      where: { classId_subjectId: { classId, subjectId } },
    });
    if (!assignment || assignment.teacherId !== scope.teacherId) {
      throw new ForbiddenException(
        "Cette matière n'est pas la vôtre dans cette classe : vous ne pouvez pas y saisir de notes.",
      );
    }
  }

  /** Statut du trimestre pour une classe : OUVERT tant que la Direction n'a rien validé. */
  async periodStatus(termId: string, classId: string) {
    const period = await this.prisma.bulletinPeriod.findUnique({
      where: { termId_classId: { termId, classId } },
    });
    return period?.statut ?? 'OUVERT';
  }

  private async assertYearEditable(classId: string) {
    const klass = await this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      include: { academicYear: true },
    });
    if (klass.academicYear.statut === 'CLOTUREE') {
      throw new ConflictException(
        "L'année scolaire est clôturée : les notes ne sont plus modifiables.",
      );
    }
  }

  // ---------------------------------------------------------------------------------------------- Contexte

  /** Ce dont l'écran a besoin : trimestres de l'année active, classes et matières accessibles, paramètres. */
  async context(user: CurrentUserData) {
    const scope = await this.scopeOf(user);
    const year = await this.prisma.academicYear.findFirst({
      where: { statut: 'ACTIVE' },
    });
    const school = await this.prisma.school.findFirstOrThrow({
      select: {
        baremeDefaut: true,
        moyennePassage: true,
        bulletinAfficheRang: true,
      },
    });
    if (!year)
      return {
        annee: null,
        trimestres: [],
        classes: [],
        affectations: [],
        parametres: this.settingsOut(school),
      };

    const [terms, assignments, allClasses] = await Promise.all([
      this.prisma.term.findMany({
        where: { academicYearId: year.id },
        orderBy: { ordre: 'asc' },
      }),
      this.prisma.teachingAssignment.findMany({
        where: {
          class: { academicYearId: year.id },
          ...(scope ? { teacherId: scope.teacherId } : {}),
        },
        include: { class: true, subject: true, teacher: true },
      }),
      this.prisma.class.findMany({
        where: { academicYearId: year.id },
        include: { level: { include: { cycle: true } } },
        orderBy: [{ level: { ordre: 'asc' } }, { nom: 'asc' }],
      }),
    ]);

    const classIds = new Set(assignments.map((a) => a.classId));
    const classes = allClasses.filter((c) => !scope || classIds.has(c.id));
    return {
      annee: { id: year.id, libelle: year.libelle },
      trimestres: terms.map((t) => ({
        id: t.id,
        libelle: t.libelle,
        ordre: t.ordre,
        dateDebut: isoDay(t.dateDebut),
        dateFin: isoDay(t.dateFin),
      })),
      classes: classes.map((c) => ({
        id: c.id,
        nom: c.nom,
        levelId: c.levelId,
      })),
      affectations: assignments
        .map((a) => ({
          classId: a.classId,
          className: a.class.nom,
          subjectId: a.subjectId,
          subjectName: a.subject.nom,
          teacherName: `${a.teacher.prenom} ${a.teacher.nom}`,
        }))
        .sort(
          (a, b) =>
            a.className.localeCompare(b.className, 'fr') ||
            a.subjectName.localeCompare(b.subjectName, 'fr'),
        ),
      parametres: this.settingsOut(school),
    };
  }

  private settingsOut(school: {
    baremeDefaut: number;
    moyennePassage: Prisma.Decimal | null;
    bulletinAfficheRang: boolean;
  }) {
    return {
      baremeDefaut: school.baremeDefaut,
      moyennePassage:
        school.moyennePassage === null ? null : Number(school.moyennePassage),
      bulletinAfficheRang: school.bulletinAfficheRang,
    };
  }

  // ---------------------------------------------------------------------------------------------- Évaluations

  async listEvaluations(
    user: CurrentUserData,
    q: { classId?: string; subjectId?: string; termId?: string },
  ) {
    const scope = await this.scopeOf(user);
    const pairs = await this.allowedPairs(scope);
    const evaluations = await this.prisma.evaluation.findMany({
      where: {
        ...(q.classId ? { classId: q.classId } : {}),
        ...(q.subjectId ? { subjectId: q.subjectId } : {}),
        ...(q.termId ? { termId: q.termId } : {}),
        ...(pairs
          ? {
              OR: pairs.length
                ? pairs.map((p) => ({
                    classId: p.classId,
                    subjectId: p.subjectId,
                  }))
                : [{ id: '__none__' }],
            }
          : {}),
      },
      include: {
        grades: { select: { statut: true } },
        class: true,
        subject: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return Promise.all(
      evaluations.map(async (e) => ({
        id: e.id,
        termId: e.termId,
        classId: e.classId,
        className: e.class.nom,
        subjectId: e.subjectId,
        subjectName: e.subject.nom,
        titre: e.titre,
        date: isoDay(e.date),
        bareme: e.bareme,
        coefficient: e.coefficient,
        notes: e.grades.filter((g) => g.statut === 'NOTE').length,
        absents: e.grades.filter((g) => g.statut === 'ABSENT').length,
        dispenses: e.grades.filter((g) => g.statut === 'DISPENSE').length,
        effectif: await this.rosterSize(e.classId),
        periode: await this.periodStatus(e.termId, e.classId),
      })),
    );
  }

  private rosterSize(classId: string) {
    return this.prisma.enrollment.count({
      where: { classId, statut: 'ACTIVE', student: { statut: 'ACTIF' } },
    });
  }

  async createEvaluation(dto: CreateEvaluationDto, user: CurrentUserData) {
    const scope = await this.scopeOf(user);
    const klass = await this.prisma.class.findUnique({
      where: { id: dto.classId },
    });
    if (!klass) throw new NotFoundException('Classe introuvable.');
    const term = await this.prisma.term.findUnique({
      where: { id: dto.termId },
    });
    if (!term) throw new NotFoundException('Trimestre introuvable.');
    if (term.academicYearId !== klass.academicYearId) {
      throw new UnprocessableEntityException(
        "Ce trimestre n'appartient pas à l'année scolaire de la classe.",
      );
    }
    const assignment = await this.prisma.teachingAssignment.findUnique({
      where: {
        classId_subjectId: { classId: dto.classId, subjectId: dto.subjectId },
      },
    });
    if (!assignment) {
      throw new UnprocessableEntityException(
        "Aucun enseignant n'est affecté à cette matière dans cette classe.",
      );
    }
    await this.assertPair(scope, dto.classId, dto.subjectId);
    await this.assertYearEditable(dto.classId);
    if ((await this.periodStatus(dto.termId, dto.classId)) !== 'OUVERT') {
      throw new ConflictException(
        'Ce trimestre est validé pour cette classe : on ne peut plus y ajouter d’évaluation. La Direction peut le rouvrir.',
      );
    }
    const school = await this.prisma.school.findFirstOrThrow({
      select: { baremeDefaut: true },
    });
    const evaluation = await this.prisma.evaluation.create({
      data: {
        termId: dto.termId,
        classId: dto.classId,
        subjectId: dto.subjectId,
        teacherId: assignment.teacherId,
        titre: dto.titre.trim(),
        date: toDateOnly(dto.date),
        bareme: dto.bareme ?? school.baremeDefaut,
        coefficient: dto.coefficient ?? 1,
        createdById: user.id,
      },
    });
    await this.log(
      user.id,
      'GRADE_EVALUATION_CREATE',
      'Evaluation',
      evaluation.id,
      null,
      {
        classId: dto.classId,
        subjectId: dto.subjectId,
        termId: dto.termId,
        titre: evaluation.titre,
        bareme: evaluation.bareme,
        coefficient: evaluation.coefficient,
      },
    );
    return this.evaluationOut(evaluation.id);
  }

  private async evaluationOut(id: string) {
    const e = await this.prisma.evaluation.findUniqueOrThrow({
      where: { id },
      include: { class: true, subject: true },
    });
    return {
      id: e.id,
      termId: e.termId,
      classId: e.classId,
      className: e.class.nom,
      subjectId: e.subjectId,
      subjectName: e.subject.nom,
      titre: e.titre,
      date: isoDay(e.date),
      bareme: e.bareme,
      coefficient: e.coefficient,
    };
  }

  private async loadEvaluation(id: string, user: CurrentUserData) {
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
      include: { class: true, subject: true },
    });
    if (!evaluation) throw new NotFoundException('Évaluation introuvable.');
    const scope = await this.scopeOf(user);
    await this.assertPair(scope, evaluation.classId, evaluation.subjectId);
    return evaluation;
  }

  async updateEvaluation(
    id: string,
    dto: UpdateEvaluationDto,
    user: CurrentUserData,
  ) {
    const before = await this.loadEvaluation(id, user);
    await this.assertYearEditable(before.classId);
    if ((await this.periodStatus(before.termId, before.classId)) !== 'OUVERT') {
      throw new ConflictException(
        'Ce trimestre est validé : l’évaluation ne peut plus être modifiée.',
      );
    }
    if (dto.bareme !== undefined && dto.bareme < before.bareme) {
      const over = await this.prisma.grade.count({
        where: { evaluationId: id, statut: 'NOTE', valeur: { gt: dto.bareme } },
      });
      if (over > 0) {
        throw new UnprocessableEntityException(
          `Ce barème est inférieur à ${over} note(s) déjà saisie(s).`,
        );
      }
    }
    await this.prisma.evaluation.update({
      where: { id },
      data: {
        titre: dto.titre?.trim(),
        date: dto.date ? toDateOnly(dto.date) : undefined,
        bareme: dto.bareme,
        coefficient: dto.coefficient,
      },
    });
    const after = await this.evaluationOut(id);
    await this.log(
      user.id,
      'GRADE_EVALUATION_UPDATE',
      'Evaluation',
      id,
      {
        titre: before.titre,
        date: isoDay(before.date),
        bareme: before.bareme,
        coefficient: before.coefficient,
      },
      after,
    );
    return after;
  }

  async deleteEvaluation(id: string, user: CurrentUserData) {
    const before = await this.loadEvaluation(id, user);
    await this.assertYearEditable(before.classId);
    if ((await this.periodStatus(before.termId, before.classId)) !== 'OUVERT') {
      throw new ConflictException(
        'Ce trimestre est validé : l’évaluation ne peut plus être supprimée.',
      );
    }
    const noted = await this.prisma.grade.count({
      where: { evaluationId: id },
    });
    await this.prisma.evaluation.delete({ where: { id } });
    await this.log(
      user.id,
      'GRADE_EVALUATION_DELETE',
      'Evaluation',
      id,
      { titre: before.titre, notesSupprimees: noted },
      null,
    );
    return { id };
  }

  // ---------------------------------------------------------------------------------------------- Feuille de notes

  async sheet(id: string, user: CurrentUserData) {
    const evaluation = await this.loadEvaluation(id, user);
    return this.sheetOf(evaluation.id);
  }

  private async sheetOf(evaluationId: string) {
    const evaluation = await this.prisma.evaluation.findUniqueOrThrow({
      where: { id: evaluationId },
      include: {
        class: true,
        subject: true,
        term: true,
        grades: { include: { student: true } },
      },
    });
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        classId: evaluation.classId,
        statut: 'ACTIVE',
        student: { statut: 'ACTIF' },
      },
      include: { student: true },
    });
    const gradeBy = new Map(evaluation.grades.map((g) => [g.studentId, g]));
    const rosterIds = new Set(enrollments.map((e) => e.studentId));
    // Un élève qui a quitté la classe depuis la saisie garde sa ligne ; un nouvel inscrit apparaît sans note.
    const students = [
      ...enrollments.map((e) => e.student),
      ...evaluation.grades
        .filter((g) => !rosterIds.has(g.studentId))
        .map((g) => g.student),
    ].sort(
      (a, b) =>
        a.nom.localeCompare(b.nom, 'fr') ||
        a.prenom.localeCompare(b.prenom, 'fr'),
    );
    const statut = await this.periodStatus(
      evaluation.termId,
      evaluation.classId,
    );
    return {
      evaluation: {
        id: evaluation.id,
        termId: evaluation.termId,
        trimestre: evaluation.term.libelle,
        classId: evaluation.classId,
        className: evaluation.class.nom,
        subjectId: evaluation.subjectId,
        subjectName: evaluation.subject.nom,
        titre: evaluation.titre,
        date: isoDay(evaluation.date),
        bareme: evaluation.bareme,
        coefficient: evaluation.coefficient,
      },
      periode: statut,
      verrouille: statut !== 'OUVERT',
      eleves: students.map((s) => {
        const g = gradeBy.get(s.id);
        return {
          studentId: s.id,
          matricule: s.matricule,
          nom: s.nom,
          prenom: s.prenom,
          statut: g?.statut ?? null,
          valeur:
            g?.valeur === null || g?.valeur === undefined
              ? null
              : Number(g.valeur),
        };
      }),
    };
  }

  /**
   * Enregistre une feuille : seuls les élèves listés sont touchés (un élève absent de la liste garde sa note), donc
   * renvoyer la même liste ne change rien (synchronisation hors ligne, réponse perdue). Trimestre ouvert : GRADE_ENTER
   * dans sa portée. Trimestre verrouillé : GRADE_CORRECT et motif obligatoire, chaque changement est historisé.
   */
  async saveNotes(id: string, dto: SaveNotesDto, user: CurrentUserData) {
    const evaluation = await this.loadEvaluation(id, user);
    await this.assertYearEditable(evaluation.classId);
    const statut = await this.periodStatus(
      evaluation.termId,
      evaluation.classId,
    );
    const locked = statut !== 'OUVERT';
    const motif = dto.motif?.trim() ?? '';
    if (locked) {
      if (!user.permissions.includes('GRADE_CORRECT')) {
        throw new ForbiddenException(
          'Ce trimestre est validé : seule la Direction peut corriger une note.',
        );
      }
      if (!motif)
        throw new UnprocessableEntityException(
          'Une correction exige un motif.',
        );
    } else if (!user.permissions.includes('GRADE_ENTER')) {
      throw new ForbiddenException(
        'Vous n’avez pas le droit de saisir des notes.',
      );
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        classId: evaluation.classId,
        statut: 'ACTIVE',
        student: { statut: 'ACTIF' },
      },
      select: { studentId: true },
    });
    const existing = await this.prisma.grade.findMany({
      where: { evaluationId: id },
    });
    const known = new Set([
      ...enrollments.map((e) => e.studentId),
      ...existing.map((g) => g.studentId),
    ]);
    const existingBy = new Map(existing.map((g) => [g.studentId, g]));

    const seen = new Set<string>();
    for (const item of dto.notes) {
      if (seen.has(item.studentId))
        throw new BadRequestException(
          'Un élève figure deux fois dans la liste.',
        );
      seen.add(item.studentId);
      if (!known.has(item.studentId)) {
        throw new UnprocessableEntityException(
          "Un élève de la liste n'est pas inscrit dans la classe de cette évaluation.",
        );
      }
      if (item.statut === 'NOTE') {
        if (item.valeur === undefined || item.valeur === null) {
          throw new UnprocessableEntityException(
            'Indiquez la note, ou « absent » / « dispensé ».',
          );
        }
        if (item.valeur > evaluation.bareme) {
          throw new UnprocessableEntityException(
            `Une note ne peut pas dépasser le barème (${evaluation.bareme}).`,
          );
        }
      } else if (item.valeur !== undefined && item.valeur !== null) {
        throw new UnprocessableEntityException(
          'Une valeur n’est acceptée que pour une note.',
        );
      }
    }

    type Change = {
      studentId: string;
      ancienStatut: 'NOTE' | 'ABSENT' | 'DISPENSE' | null;
      ancienneValeur: number | null;
      nouveauStatut: 'NOTE' | 'ABSENT' | 'DISPENSE' | null;
      nouvelleValeur: number | null;
    };
    const changes: Change[] = [];
    for (const item of dto.notes) {
      // Après verrouillage on corrige une note, on ne l'efface pas : la suppression emporterait son historique.
      if (locked && item.statut === 'AUCUNE') {
        throw new UnprocessableEntityException(
          'Après validation, une note se corrige (note, absent ou dispensé) mais ne s’efface pas.',
        );
      }
      const prev = existingBy.get(item.studentId);
      const prevValeur =
        prev?.valeur === null || prev?.valeur === undefined
          ? null
          : Number(prev.valeur);
      const nextStatut = item.statut === 'AUCUNE' ? null : item.statut;
      const nextValeur = item.statut === 'NOTE' ? (item.valeur ?? null) : null;
      if ((prev?.statut ?? null) === nextStatut && prevValeur === nextValeur)
        continue;
      changes.push({
        studentId: item.studentId,
        ancienStatut: prev?.statut ?? null,
        ancienneValeur: prevValeur,
        nouveauStatut: nextStatut,
        nouvelleValeur: nextValeur,
      });
    }

    if (changes.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const c of changes) {
          const prev = existingBy.get(c.studentId);
          if (c.nouveauStatut === null) {
            if (prev) await tx.grade.delete({ where: { id: prev.id } });
            continue;
          }
          const grade = prev
            ? await tx.grade.update({
                where: { id: prev.id },
                data: {
                  statut: c.nouveauStatut,
                  valeur: c.nouvelleValeur,
                  saisiParId: user.id,
                },
              })
            : await tx.grade.create({
                data: {
                  evaluationId: id,
                  studentId: c.studentId,
                  statut: c.nouveauStatut,
                  valeur: c.nouvelleValeur,
                  saisiParId: user.id,
                },
              });
          if (locked)
            await this.recordCorrection(
              tx,
              grade.id,
              { ...c, nouveauStatut: c.nouveauStatut },
              motif,
              user.id,
            );
        }
      });
      // Jamais la valeur des notes dans le journal : le nombre de changements et le motif suffisent (RV12).
      await this.log(
        user.id,
        locked ? 'GRADE_CORRECT' : 'GRADE_SHEET_SAVE',
        'Evaluation',
        id,
        null,
        {
          changements: changes.length,
          ...(locked ? { motif } : {}),
        },
      );
    }
    return this.sheetOf(id);
  }

  private async recordCorrection(
    tx: Prisma.TransactionClient,
    gradeId: string,
    c: {
      ancienStatut: 'NOTE' | 'ABSENT' | 'DISPENSE' | null;
      ancienneValeur: number | null;
      nouveauStatut: 'NOTE' | 'ABSENT' | 'DISPENSE';
      nouvelleValeur: number | null;
    },
    motif: string,
    userId: string,
  ) {
    await tx.gradeCorrection.create({
      data: {
        gradeId,
        ancienStatut: c.ancienStatut,
        ancienneValeur: c.ancienneValeur,
        nouveauStatut: c.nouveauStatut,
        nouvelleValeur: c.nouvelleValeur,
        motif,
        userId,
      },
    });
  }

  // ---------------------------------------------------------------------------------------------- Résultats

  /**
   * Résultats d'une classe pour un trimestre, recalculés à la demande. La Direction et l'Administrateur voient toutes
   * les matières, la moyenne générale et le rang ; un enseignant ne voit que les colonnes de ses matières.
   */
  async classResults(user: CurrentUserData, classId: string, termId: string) {
    const scope = await this.scopeOf(user);
    const computation = await this.results.computeClass(classId, termId);
    let matieres = computation.matieres;
    let full = true;
    if (scope) {
      const own = await this.prisma.teachingAssignment.findMany({
        where: { classId, teacherId: scope.teacherId },
        select: { subjectId: true },
      });
      const ids = new Set(own.map((a) => a.subjectId));
      if (ids.size === 0)
        throw new ForbiddenException(
          "Vous n'enseignez dans cette classe aucune matière.",
        );
      matieres = matieres.filter((m) => ids.has(m.subjectId));
      full = false;
    }
    const periode = await this.periodStatus(termId, classId);
    return {
      classe: computation.classe,
      periode,
      matieres: matieres.map((m) => ({
        ...m,
        stats: computation.statsMatieres[m.subjectId],
      })),
      eleves: computation.eleves.map((e) => ({
        studentId: e.studentId,
        matricule: e.matricule,
        nom: e.nom,
        prenom: e.prenom,
        moyennes: Object.fromEntries(
          matieres.map((m) => [m.subjectId, e.moyennes[m.subjectId]]),
        ),
        ...(full ? { moyenneGenerale: e.moyenneGenerale, rang: e.rang } : {}),
      })),
      ...(full ? { statsGenerale: computation.statsGenerale } : {}),
      complet: full,
    };
  }

  // ---------------------------------------------------------------------------------------------- Appréciations

  async listAppreciations(
    user: CurrentUserData,
    q: { termId: string; classId: string; subjectId: string },
  ) {
    const scope = await this.scopeOf(user);
    await this.assertPair(scope, q.classId, q.subjectId);
    const rows = await this.prisma.subjectAppreciation.findMany({
      where: { termId: q.termId, classId: q.classId, subjectId: q.subjectId },
    });
    return rows.map((r) => ({ studentId: r.studentId, texte: r.texte }));
  }

  async saveAppreciations(dto: SaveAppreciationsDto, user: CurrentUserData) {
    const scope = await this.scopeOf(user);
    await this.assertPair(scope, dto.classId, dto.subjectId);
    await this.assertYearEditable(dto.classId);
    if ((await this.periodStatus(dto.termId, dto.classId)) !== 'OUVERT') {
      throw new ConflictException(
        'Ce trimestre est validé : les appréciations ne sont plus modifiables. La Direction peut le rouvrir.',
      );
    }
    const enrolled = await this.prisma.enrollment.findMany({
      where: { classId: dto.classId, statut: 'ACTIVE' },
      select: { studentId: true },
    });
    const ids = new Set(enrolled.map((e) => e.studentId));
    for (const item of dto.items) {
      if (!ids.has(item.studentId)) {
        throw new UnprocessableEntityException(
          "Un élève de la liste n'est pas inscrit dans cette classe.",
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const key = {
          termId_classId_subjectId_studentId: {
            termId: dto.termId,
            classId: dto.classId,
            subjectId: dto.subjectId,
            studentId: item.studentId,
          },
        };
        const texte = item.texte.trim();
        if (!texte) {
          await tx.subjectAppreciation.deleteMany({
            where: {
              termId: dto.termId,
              classId: dto.classId,
              subjectId: dto.subjectId,
              studentId: item.studentId,
            },
          });
        } else {
          await tx.subjectAppreciation.upsert({
            where: key,
            create: {
              termId: dto.termId,
              classId: dto.classId,
              subjectId: dto.subjectId,
              studentId: item.studentId,
              texte,
              saisiParId: user.id,
            },
            update: { texte, saisiParId: user.id },
          });
        }
      }
    });
    // Jamais le texte dans le journal.
    await this.log(
      user.id,
      'GRADE_APPRECIATIONS_SAVE',
      'SubjectAppreciation',
      `${dto.classId}:${dto.subjectId}:${dto.termId}`,
      null,
      {
        eleves: dto.items.length,
      },
    );
    return this.listAppreciations(user, dto);
  }
}

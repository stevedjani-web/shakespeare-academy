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
import { isoDay } from '../pedagogy/pedagogy.util';
import type { CurrentUserData } from '../auth/types/current-user.interface';
import { GradeResultsService } from './grade-results.service';
import { letterFor, passed, type Band } from './grade-calc.util';

/** Contenu figé d'un bulletin (colonne JSON `lignes`). */
interface FrozenLine {
  subjectId: string;
  nom: string;
  coefficient: number;
  moyenne: number | null;
  moyenneClasse: number | null;
  min: number | null;
  max: number | null;
  lettre: string | null;
  appreciation: string | null;
}
interface FrozenContent {
  matieres: FrozenLine[];
  general: { lettre: string | null; admis: boolean | null };
  parametres: { affichageLettres: boolean; moyennePassage: number | null };
}

const num = (d: Prisma.Decimal | null): number | null =>
  d === null ? null : Number(d);

/**
 * Cycle de vie d'un trimestre pour une classe : OUVERT (saisie) puis VALIDE (la Direction fige les bulletins) puis
 * PUBLIE (visible des parents). Le parent ne voit jamais les notes en direct : uniquement l'instantané validé.
 */
@Injectable()
export class BulletinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
    private readonly results: GradeResultsService,
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
      entite: 'BulletinPeriod',
      entiteId,
      nouvelleValeur,
    });
  }

  private async load(termId: string, classId: string) {
    const [term, klass] = await Promise.all([
      this.prisma.term.findUnique({ where: { id: termId } }),
      this.prisma.class.findUnique({
        where: { id: classId },
        include: { academicYear: true },
      }),
    ]);
    if (!term) throw new NotFoundException('Trimestre introuvable.');
    if (!klass) throw new NotFoundException('Classe introuvable.');
    if (term.academicYearId !== klass.academicYearId) {
      throw new UnprocessableEntityException(
        "Ce trimestre n'appartient pas à l'année scolaire de la classe.",
      );
    }
    return { term, klass };
  }

  private assertYearOpen(klass: { academicYear: { statut: string } }) {
    if (klass.academicYear.statut === 'CLOTUREE') {
      throw new ConflictException(
        "L'année scolaire est clôturée : les bulletins ne sont plus modifiables.",
      );
    }
  }

  // ---------------------------------------------------------------------------------------------- État d'un trimestre

  async period(termId: string, classId: string) {
    const { term, klass } = await this.load(termId, classId);
    const period = await this.prisma.bulletinPeriod.findUnique({
      where: { termId_classId: { termId, classId } },
    });
    const [evaluations, assignments, bulletins] = await Promise.all([
      this.prisma.evaluation.findMany({
        where: { termId, classId },
        select: {
          id: true,
          subjectId: true,
          _count: { select: { grades: true } },
        },
      }),
      this.prisma.teachingAssignment.findMany({
        where: { classId },
        include: { subject: true },
      }),
      this.prisma.bulletin.count({ where: { period: { termId, classId } } }),
    ]);
    const withEvaluation = new Set(evaluations.map((e) => e.subjectId));
    // Notes corrigées depuis la validation : le bulletin figé n'en tient pas compte tant qu'on ne revalide pas.
    const corrections = period?.valideAt
      ? await this.prisma.gradeCorrection.count({
          where: {
            createdAt: { gt: period.valideAt },
            grade: { evaluation: { termId, classId } },
          },
        })
      : 0;
    return {
      termId,
      classId,
      trimestre: term.libelle,
      classe: klass.nom,
      statut: period?.statut ?? 'OUVERT',
      valideAt: period?.valideAt ?? null,
      publieAt: period?.publieAt ?? null,
      rouvertAt: period?.rouvertAt ?? null,
      rouvertMotif: period?.rouvertMotif ?? null,
      evaluations: evaluations.length,
      evaluationsSansNote: evaluations.filter((e) => e._count.grades === 0)
        .length,
      matieresSansEvaluation: assignments
        .filter((a) => !withEvaluation.has(a.subjectId))
        .map((a) => a.subject.nom)
        .sort((a, b) => a.localeCompare(b, 'fr')),
      bulletins,
      correctionsDepuisValidation: corrections,
    };
  }

  // ---------------------------------------------------------------------------------------------- Validation

  /**
   * Fige les bulletins du trimestre : calcule les moyennes, les rangs et les lettres et en garde un instantané. Rejouer
   * la validation d'un trimestre déjà validé (après des corrections) recalcule l'instantané sur place, en gardant
   * les appréciations générales déjà saisies. Un trimestre publié doit d'abord être rouvert.
   */
  async validate(termId: string, classId: string, user: CurrentUserData) {
    const { klass } = await this.load(termId, classId);
    this.assertYearOpen(klass);
    const existing = await this.prisma.bulletinPeriod.findUnique({
      where: { termId_classId: { termId, classId } },
    });
    if (existing?.statut === 'PUBLIE') {
      throw new ConflictException(
        'Ce trimestre est publié : rouvrez-le avant de le valider de nouveau.',
      );
    }
    const computation = await this.results.computeClass(classId, termId);
    if (computation.matieres.length === 0) {
      throw new UnprocessableEntityException(
        "Aucune évaluation n'existe pour ce trimestre : il n'y a rien à valider.",
      );
    }
    if (computation.eleves.length === 0) {
      throw new UnprocessableEntityException(
        "Aucun élève n'est inscrit dans cette classe.",
      );
    }

    const school = await this.prisma.school.findFirstOrThrow({
      select: { moyennePassage: true },
    });
    const moyennePassage = num(school.moyennePassage);
    const bands: Band[] = (await this.prisma.gradeBand.findMany()).map((b) => ({
      lettre: b.lettre,
      minimum: Number(b.minimum),
    }));
    const affichageLettres = computation.classe.affichageLettres;
    const letter = (moyenne: number | null) =>
      affichageLettres ? letterFor(moyenne, bands) : null;

    const effectif = computation.eleves.length;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const period = await tx.bulletinPeriod.upsert({
        where: { termId_classId: { termId, classId } },
        create: {
          termId,
          classId,
          statut: 'VALIDE',
          valideAt: now,
          valideParId: user.id,
        },
        update: {
          statut: 'VALIDE',
          valideAt: now,
          valideParId: user.id,
          publieAt: null,
          publieParId: null,
        },
      });
      // Mise à jour sur place : l'identifiant d'un bulletin ne change pas à la revalidation (un lien déjà ouvert par un
      // parent reste valable) et l'appréciation générale déjà saisie est conservée.
      await tx.bulletin.deleteMany({
        where: {
          periodId: period.id,
          studentId: { notIn: computation.eleves.map((e) => e.studentId) },
        },
      });
      for (const eleve of computation.eleves) {
        const contenu: FrozenContent = {
          matieres: computation.matieres.map((m) => {
            const stats = computation.statsMatieres[m.subjectId];
            const moyenne = eleve.moyennes[m.subjectId];
            return {
              subjectId: m.subjectId,
              nom: m.nom,
              coefficient: m.coefficient,
              moyenne,
              moyenneClasse: stats?.moyenne ?? null,
              min: stats?.min ?? null,
              max: stats?.max ?? null,
              lettre: letter(moyenne),
              appreciation:
                computation.appreciations.get(
                  `${m.subjectId}:${eleve.studentId}`,
                ) ?? null,
            };
          }),
          general: {
            lettre: letter(eleve.moyenneGenerale),
            admis: passed(eleve.moyenneGenerale, moyennePassage),
          },
          parametres: { affichageLettres, moyennePassage },
        };
        const values = {
          moyenneGenerale: eleve.moyenneGenerale,
          rang: eleve.rang,
          effectif,
          moyenneClasse: computation.statsGenerale?.moyenne ?? null,
          lignes: contenu as unknown as Prisma.InputJsonValue,
        };
        await tx.bulletin.upsert({
          where: {
            periodId_studentId: {
              periodId: period.id,
              studentId: eleve.studentId,
            },
          },
          create: {
            periodId: period.id,
            studentId: eleve.studentId,
            ...values,
          },
          update: values,
        });
      }
    });
    await this.log(
      user.id,
      'BULLETIN_PERIOD_VALIDATE',
      `${classId}:${termId}`,
      { eleves: effectif },
    );
    return this.period(termId, classId);
  }

  async reopen(
    termId: string,
    classId: string,
    motif: string,
    user: CurrentUserData,
  ) {
    const { klass } = await this.load(termId, classId);
    this.assertYearOpen(klass);
    const existing = await this.prisma.bulletinPeriod.findUnique({
      where: { termId_classId: { termId, classId } },
    });
    if (!existing || existing.statut === 'OUVERT') {
      throw new ConflictException(
        "Ce trimestre est déjà ouvert : il n'y a rien à rouvrir.",
      );
    }
    await this.prisma.bulletinPeriod.update({
      where: { id: existing.id },
      data: {
        statut: 'OUVERT',
        publieAt: null,
        publieParId: null,
        rouvertAt: new Date(),
        rouvertParId: user.id,
        rouvertMotif: motif.trim(),
      },
    });
    await this.log(user.id, 'BULLETIN_PERIOD_REOPEN', `${classId}:${termId}`, {
      etaitPublie: existing.statut === 'PUBLIE',
      motif: motif.trim(),
    });
    return this.period(termId, classId);
  }

  async publish(termId: string, classId: string, user: CurrentUserData) {
    const { term, klass } = await this.load(termId, classId);
    this.assertYearOpen(klass);
    const existing = await this.prisma.bulletinPeriod.findUnique({
      where: { termId_classId: { termId, classId } },
      include: {
        bulletins: {
          include: { student: { select: { id: true, prenom: true } } },
        },
      },
    });
    if (!existing || existing.statut !== 'VALIDE') {
      throw new ConflictException(
        "Seul un trimestre validé peut être publié : validez-le d'abord.",
      );
    }
    // Des notes corrigées depuis la validation ne sont pas dans le bulletin figé : on refuse de le publier tel quel.
    const corrections = await this.prisma.gradeCorrection.count({
      where: {
        createdAt: { gt: existing.valideAt ?? new Date(0) },
        grade: { evaluation: { termId, classId } },
      },
    });
    if (corrections > 0) {
      throw new ConflictException(
        `${corrections} note(s) ont été corrigées depuis la validation : validez de nouveau le trimestre avant de le publier.`,
      );
    }
    await this.prisma.bulletinPeriod.update({
      where: { id: existing.id },
      data: { statut: 'PUBLIE', publieAt: new Date(), publieParId: user.id },
    });
    await this.log(user.id, 'BULLETIN_PERIOD_PUBLISH', `${classId}:${termId}`, {
      eleves: existing.bulletins.length,
    });
    // Jamais bloquant, jamais une note dans le texte (RV10).
    await this.notifications.notifyBulletinPublished(
      existing.bulletins.map((b) => b.student),
      term.libelle.toLowerCase(),
    );
    return this.period(termId, classId);
  }

  // ---------------------------------------------------------------------------------------------- Bulletins (personnel)

  async list(termId: string, classId: string) {
    const period = await this.period(termId, classId);
    if (period.statut === 'OUVERT') return { periode: period, bulletins: [] };
    const bulletins = await this.prisma.bulletin.findMany({
      where: { period: { termId, classId } },
      include: { student: true },
    });
    return {
      periode: period,
      bulletins: bulletins
        .sort(
          (a, b) =>
            (a.rang ?? 1e9) - (b.rang ?? 1e9) ||
            a.student.nom.localeCompare(b.student.nom, 'fr'),
        )
        .map((b) => ({
          id: b.id,
          studentId: b.studentId,
          matricule: b.student.matricule,
          nom: b.student.nom,
          prenom: b.student.prenom,
          moyenneGenerale: num(b.moyenneGenerale),
          rang: b.rang,
          effectif: b.effectif,
          appreciationGenerale: b.appreciationGenerale,
        })),
    };
  }

  async setAppreciation(id: string, texte: string, user: CurrentUserData) {
    const bulletin = await this.prisma.bulletin.findUnique({
      where: { id },
      include: { period: true },
    });
    if (!bulletin) throw new NotFoundException('Bulletin introuvable.');
    if (bulletin.period.statut !== 'VALIDE') {
      throw new ConflictException(
        "L'appréciation générale se saisit tant que le trimestre est validé et non publié. Rouvrez-le pour la changer.",
      );
    }
    const value = texte.trim() || null;
    await this.prisma.bulletin.update({
      where: { id },
      data: { appreciationGenerale: value },
    });
    // Jamais le texte dans le journal.
    await this.log(
      user.id,
      'BULLETIN_APPRECIATION_SET',
      `${bulletin.period.classId}:${bulletin.period.termId}`,
      {
        studentId: bulletin.studentId,
        efface: value === null,
      },
    );
    return { id, appreciationGenerale: value };
  }

  /** Détail complet d'un bulletin pour le personnel autorisé (Direction, Administrateur). */
  async detail(id: string) {
    const bulletin = await this.loadFull(id);
    if (!bulletin) throw new NotFoundException('Bulletin introuvable.');
    if (bulletin.period.statut === 'OUVERT') {
      throw new ConflictException(
        "Ce trimestre est rouvert : le bulletin n'est plus valable, validez-le de nouveau.",
      );
    }
    return this.payload(bulletin, true);
  }

  // ---------------------------------------------------------------------------------------------- Parents

  /** Bulletins PUBLIÉS d'un enfant (le contrôle d'accès à l'enfant est fait par le portail avant cet appel). */
  async publishedForStudent(studentId: string) {
    const bulletins = await this.prisma.bulletin.findMany({
      where: { studentId, period: { statut: 'PUBLIE' } },
      include: {
        period: {
          include: { term: true, class: { include: { academicYear: true } } },
        },
      },
      orderBy: { period: { publieAt: 'desc' } },
    });
    return bulletins.map((b) => ({
      id: b.id,
      trimestre: b.period.term.libelle,
      classe: b.period.class.nom,
      annee: b.period.class.academicYear.libelle,
      moyenneGenerale: num(b.moyenneGenerale),
      publieAt: b.period.publieAt,
    }));
  }

  async publishedDetail(studentId: string, bulletinId: string) {
    const bulletin = await this.loadFull(bulletinId);
    // 404 (jamais 403) : un bulletin d'un autre enfant ou non publié n'existe pas pour ce parent (RV08).
    if (
      !bulletin ||
      bulletin.studentId !== studentId ||
      bulletin.period.statut !== 'PUBLIE'
    ) {
      throw new NotFoundException('Bulletin introuvable.');
    }
    const school = await this.prisma.school.findFirstOrThrow({
      select: { bulletinAfficheRang: true },
    });
    return this.payload(bulletin, school.bulletinAfficheRang);
  }

  // ---------------------------------------------------------------------------------------------- Présentation

  private loadFull(id: string) {
    return this.prisma.bulletin.findUnique({
      where: { id },
      include: {
        student: true,
        period: {
          include: {
            term: true,
            class: {
              include: {
                academicYear: true,
                level: { include: { cycle: { include: { section: true } } } },
              },
            },
          },
        },
      },
    });
  }

  private async payload(
    bulletin: NonNullable<Awaited<ReturnType<BulletinsService['loadFull']>>>,
    withRank: boolean,
  ) {
    const school = await this.prisma.school.findFirstOrThrow({
      select: { nom: true, adresse: true, telephone: true, logoUrl: true },
    });
    const contenu = bulletin.lignes as unknown as FrozenContent;
    const { period, student } = bulletin;
    return {
      id: bulletin.id,
      statut: period.statut,
      ecole: school,
      eleve: {
        nom: student.nom,
        prenom: student.prenom,
        matricule: student.matricule,
        dateNaissance: isoDay(student.dateNaissance),
      },
      classe: {
        nom: period.class.nom,
        niveau: period.class.level.nom,
        section: period.class.level.cycle.section.nom,
      },
      trimestre: {
        libelle: period.term.libelle,
        dateDebut: isoDay(period.term.dateDebut),
        dateFin: isoDay(period.term.dateFin),
      },
      annee: period.class.academicYear.libelle,
      moyenneGenerale: num(bulletin.moyenneGenerale),
      lettre: contenu.general.lettre,
      admis: contenu.general.admis,
      appreciationGenerale: bulletin.appreciationGenerale,
      affichageLettres: contenu.parametres.affichageLettres,
      matieres: contenu.matieres.map((m) => ({
        nom: m.nom,
        coefficient: m.coefficient,
        moyenne: m.moyenne,
        lettre: m.lettre,
        appreciation: m.appreciation,
        ...(withRank
          ? { moyenneClasse: m.moyenneClasse, min: m.min, max: m.max }
          : {}),
      })),
      ...(withRank
        ? {
            rang: bulletin.rang,
            effectif: bulletin.effectif,
            moyenneClasse: num(bulletin.moyenneClasse),
          }
        : {}),
      publieAt: period.publieAt,
    };
  }
}

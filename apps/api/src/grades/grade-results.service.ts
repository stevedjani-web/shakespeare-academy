import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  classStats,
  generalAverage,
  rankAll,
  subjectAverage,
  type GradeEntry,
  type Stats,
} from './grade-calc.util';

export interface SubjectColumn {
  subjectId: string;
  nom: string;
  coefficient: number;
  evaluations: number;
}

export interface StudentResult {
  studentId: string;
  matricule: string;
  nom: string;
  prenom: string;
  moyennes: Record<string, number | null>;
  moyenneGenerale: number | null;
  rang: number | null;
}

export interface ClassComputation {
  classe: {
    id: string;
    nom: string;
    levelId: string;
    sectionId: string;
    affichageLettres: boolean;
  };
  matieres: SubjectColumn[];
  eleves: StudentResult[];
  statsMatieres: Record<string, Stats | null>;
  statsGenerale: Stats | null;
  appreciations: Map<string, string>; // clé `${subjectId}:${studentId}`
}

/**
 * Calcule, à la demande, les moyennes d'une classe pour un trimestre à partir des notes saisies. Rien n'est stocké
 * ici : le bulletin figé est un instantané pris à la validation (BulletinsService).
 */
@Injectable()
export class GradeResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async computeClass(
    classId: string,
    termId: string,
  ): Promise<ClassComputation> {
    const klass = await this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      include: {
        level: { include: { cycle: { include: { section: true } } } },
      },
    });

    const [enrollments, evaluations, subjectLevels, appreciations] =
      await Promise.all([
        this.prisma.enrollment.findMany({
          where: { classId, statut: 'ACTIVE', student: { statut: 'ACTIF' } },
          include: { student: true },
        }),
        this.prisma.evaluation.findMany({
          where: { classId, termId },
          include: { grades: true, subject: true },
        }),
        this.prisma.subjectLevel.findMany({
          where: { levelId: klass.levelId },
        }),
        this.prisma.subjectAppreciation.findMany({
          where: { classId, termId },
        }),
      ]);

    const students = enrollments
      .map((e) => e.student)
      .sort(
        (a, b) =>
          a.nom.localeCompare(b.nom, 'fr') ||
          a.prenom.localeCompare(b.prenom, 'fr'),
      );
    const coefficientOf = new Map(
      subjectLevels.map((l) => [l.subjectId, l.coefficient]),
    );

    // Matières qui ont au moins une évaluation ce trimestre, par ordre alphabétique.
    const subjects = new Map<string, { nom: string; count: number }>();
    for (const e of evaluations) {
      const entry = subjects.get(e.subjectId) ?? {
        nom: e.subject.nom,
        count: 0,
      };
      entry.count += 1;
      subjects.set(e.subjectId, entry);
    }
    const matieres: SubjectColumn[] = [...subjects.entries()]
      .map(([subjectId, s]) => ({
        subjectId,
        nom: s.nom,
        coefficient: coefficientOf.get(subjectId) ?? 1,
        evaluations: s.count,
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

    const eleves: StudentResult[] = students.map((student) => {
      const moyennes: Record<string, number | null> = {};
      for (const m of matieres) {
        const entries: GradeEntry[] = evaluations
          .filter((e) => e.subjectId === m.subjectId)
          .map((e) => {
            const grade = e.grades.find((g) => g.studentId === student.id);
            return {
              coefficient: e.coefficient,
              bareme: e.bareme,
              statut: grade?.statut,
              valeur:
                grade?.valeur === null || grade?.valeur === undefined
                  ? null
                  : Number(grade.valeur),
            };
          });
        moyennes[m.subjectId] = subjectAverage(entries);
      }
      const moyenneGenerale = generalAverage(
        matieres.map((m) => ({
          coefficient: m.coefficient,
          moyenne: moyennes[m.subjectId],
        })),
      );
      return {
        studentId: student.id,
        matricule: student.matricule,
        nom: student.nom,
        prenom: student.prenom,
        moyennes,
        moyenneGenerale,
        rang: null,
      };
    });

    const ranks = rankAll(
      eleves.map((e) => ({ id: e.studentId, value: e.moyenneGenerale })),
    );
    for (const e of eleves) e.rang = ranks.get(e.studentId) ?? null;

    const statsMatieres: Record<string, Stats | null> = {};
    for (const m of matieres)
      statsMatieres[m.subjectId] = classStats(
        eleves.map((e) => e.moyennes[m.subjectId]),
      );

    return {
      classe: {
        id: klass.id,
        nom: klass.nom,
        levelId: klass.levelId,
        sectionId: klass.level.cycle.sectionId,
        affichageLettres: klass.level.cycle.section.affichageLettres,
      },
      matieres,
      eleves,
      statsMatieres,
      statsGenerale: classStats(eleves.map((e) => e.moyenneGenerale)),
      appreciations: new Map(
        appreciations.map((a) => [`${a.subjectId}:${a.studentId}`, a.texte]),
      ),
    };
  }
}

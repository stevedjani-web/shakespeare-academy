import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { normalize } from './pedagogy.util';
import {
  CreateAssignmentDto,
  CreateTeacherDto,
  SetTeacherSubjectsDto,
  UpdateAssignmentDto,
  UpdateTeacherDto,
} from './dto/pedagogy.dto';

/** Fiches enseignants (D56) et affectations enseignant × matière × classe. */
@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
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

  // ---------------------------------------------------------------- Enseignants

  listTeachers() {
    return this.prisma.teacher.findMany({
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      include: {
        subjects: { include: { subject: true } },
        _count: { select: { assignments: true } },
      },
    });
  }

  async findTeacher(id: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      include: {
        subjects: { include: { subject: true } },
        assignments: { include: { subject: true, class: true } },
      },
    });
    if (!teacher) {
      throw new NotFoundException('Enseignant introuvable.');
    }
    return teacher;
  }

  private async assertNameFree(nom: string, prenom: string, excludeId?: string) {
    const teachers = await this.prisma.teacher.findMany();
    const clash = teachers.find(
      (t) =>
        t.id !== excludeId &&
        normalize(t.nom) === normalize(nom) &&
        normalize(t.prenom) === normalize(prenom),
    );
    if (clash) {
      throw new ConflictException(
        'Un enseignant porte déjà ce nom et ce prénom. Précisez-en un dans le prénom (ex. initiale) si ce sont deux personnes différentes.',
      );
    }
  }

  async createTeacher(dto: CreateTeacherDto, userId: string) {
    await this.assertNameFree(dto.nom, dto.prenom);
    const teacher = await this.prisma.teacher.create({
      data: {
        schoolId: await this.school.getDefaultId(),
        nom: dto.nom.trim(),
        prenom: dto.prenom.trim(),
        telephone: dto.telephone?.trim() || null,
        email: dto.email?.trim() || null,
      },
    });
    await this.log(userId, 'TEACHER_CREATE', 'Teacher', teacher.id, null, teacher);
    return teacher;
  }

  async updateTeacher(id: string, dto: UpdateTeacherDto, userId: string) {
    const before = await this.findTeacher(id);
    const nom = dto.nom ?? before.nom;
    const prenom = dto.prenom ?? before.prenom;
    if (dto.nom || dto.prenom) {
      await this.assertNameFree(nom, prenom, id);
    }
    const teacher = await this.prisma.teacher.update({
      where: { id },
      data: {
        nom: dto.nom?.trim(),
        prenom: dto.prenom?.trim(),
        telephone: dto.telephone === undefined ? undefined : dto.telephone.trim() || null,
        email: dto.email === undefined ? undefined : dto.email.trim() || null,
        statut: dto.statut,
      },
    });
    await this.log(userId, 'TEACHER_UPDATE', 'Teacher', id, before, teacher);
    return teacher;
  }

  /** Matières que l'enseignant peut enseigner (indicatif, non bloquant pour les affectations). */
  async setTeacherSubjects(id: string, dto: SetTeacherSubjectsDto, userId: string) {
    const before = await this.findTeacher(id);
    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: dto.subjectIds } },
      select: { id: true },
    });
    if (subjects.length !== dto.subjectIds.length) {
      throw new NotFoundException('Une des matières est introuvable.');
    }
    await this.prisma.$transaction([
      this.prisma.teacherSubject.deleteMany({ where: { teacherId: id } }),
      this.prisma.teacherSubject.createMany({
        data: dto.subjectIds.map((subjectId) => ({ teacherId: id, subjectId })),
      }),
    ]);
    const after = await this.prisma.teacherSubject.findMany({ where: { teacherId: id } });
    await this.log(userId, 'TEACHER_SUBJECTS_UPDATE', 'Teacher', id, before.subjects, after);
    return after;
  }

  // --------------------------------------------------------------- Affectations

  listAssignments(filters: { classId?: string; teacherId?: string; academicYearId?: string }) {
    return this.prisma.teachingAssignment.findMany({
      where: {
        classId: filters.classId || undefined,
        teacherId: filters.teacherId || undefined,
        class: filters.academicYearId ? { academicYearId: filters.academicYearId } : undefined,
      },
      include: { subject: true, teacher: true, class: true },
      orderBy: [{ classId: 'asc' }],
    });
  }

  /**
   * Pour une classe : chaque matière enseignée à son niveau, avec l'enseignant affecté ou rien.
   * C'est la grille de saisie des affectations.
   */
  async assignmentsByClass(classId: string) {
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass) {
      throw new NotFoundException('Classe introuvable.');
    }
    const levelSubjects = await this.prisma.subjectLevel.findMany({
      where: { levelId: klass.levelId, subject: { actif: true } },
      include: { subject: true },
      orderBy: { subject: { nom: 'asc' } },
    });
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { classId },
      include: { teacher: true },
    });
    return {
      classe: klass,
      matieres: levelSubjects.map((ls) => ({
        subject: ls.subject,
        minutesParSemaine: ls.minutesParSemaine,
        assignment: assignments.find((a) => a.subjectId === ls.subjectId) ?? null,
      })),
    };
  }

  private async activeTeacher(teacherId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      throw new NotFoundException('Enseignant introuvable.');
    }
    if (teacher.statut !== 'ACTIF') {
      throw new ConflictException('Cet enseignant est inactif : réactivez-le avant de lui affecter une classe.');
    }
    return teacher;
  }

  async createAssignment(dto: CreateAssignmentDto, userId: string) {
    const klass = await this.prisma.class.findUnique({ where: { id: dto.classId } });
    if (!klass) {
      throw new NotFoundException('Classe introuvable.');
    }
    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject) {
      throw new NotFoundException('Matière introuvable.');
    }
    await this.activeTeacher(dto.teacherId);

    const atLevel = await this.prisma.subjectLevel.findUnique({
      where: { subjectId_levelId: { subjectId: subject.id, levelId: klass.levelId } },
    });
    if (!atLevel) {
      throw new UnprocessableEntityException(
        `La matière « ${subject.nom} » n'est pas enseignée au niveau de cette classe. Ajoutez d'abord ce niveau à la matière.`,
      );
    }

    const existing = await this.prisma.teachingAssignment.findUnique({
      where: { classId_subjectId: { classId: klass.id, subjectId: subject.id } },
      include: { teacher: true },
    });
    if (existing) {
      throw new ConflictException(
        `Cette matière est déjà affectée à ${existing.teacher.prenom} ${existing.teacher.nom} dans cette classe. Modifiez l'affectation existante.`,
      );
    }

    const assignment = await this.prisma.teachingAssignment.create({
      data: { classId: klass.id, subjectId: subject.id, teacherId: dto.teacherId },
    });
    await this.log(userId, 'ASSIGNMENT_CREATE', 'TeachingAssignment', assignment.id, null, assignment);
    return assignment;
  }

  async updateAssignment(id: string, dto: UpdateAssignmentDto, userId: string) {
    const before = await this.prisma.teachingAssignment.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Affectation introuvable.');
    }
    await this.activeTeacher(dto.teacherId);
    const assignment = await this.prisma.teachingAssignment.update({
      where: { id },
      data: { teacherId: dto.teacherId },
    });
    await this.log(userId, 'ASSIGNMENT_UPDATE', 'TeachingAssignment', id, before, assignment);
    return assignment;
  }

  async deleteAssignment(id: string, userId: string) {
    const before = await this.prisma.teachingAssignment.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Affectation introuvable.');
    }
    // Aucune séance ne dépend encore d'une affectation (lot 8) : suppression physique possible.
    await this.prisma.teachingAssignment.delete({ where: { id } });
    await this.log(userId, 'ASSIGNMENT_DELETE', 'TeachingAssignment', id, before, null);
    return { id };
  }
}

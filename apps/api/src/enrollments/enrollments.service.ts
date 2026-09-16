import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { NumberSequenceService } from '../common/number-sequence.service';
import { StudentsService } from '../students/students.service';
import { ClassesService } from '../classes/classes.service';
import { AcademicYearsService } from '../academic-years/academic-years.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { CancelEnrollmentDto } from './dto/cancel-enrollment.dto';

const ENROLLMENT_NUMERO_DIGITS = 5;

const ENROLLMENT_INCLUDE = {
  student: { select: { id: true, matricule: true, nom: true, prenom: true } },
  class: { select: { id: true, nom: true } },
  academicYear: { select: { id: true, libelle: true } },
} as const;

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
    private readonly numberSequenceService: NumberSequenceService,
    private readonly studentsService: StudentsService,
    private readonly classesService: ClassesService,
    private readonly academicYearsService: AcademicYearsService,
  ) {}

  async findAll(studentId?: string, classId?: string, academicYearId?: string) {
    return this.prisma.enrollment.findMany({
      where: {
        studentId: studentId || undefined,
        classId: classId || undefined,
        academicYearId: academicYearId || undefined,
      },
      include: ENROLLMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, schoolId },
      include: ENROLLMENT_INCLUDE,
    });
    if (!enrollment) {
      throw new NotFoundException('Inscription introuvable.');
    }
    return enrollment;
  }

  /**
   * Couvre à la fois la première inscription et la réinscription (cadrage §4.1/§4.2) : le type
   * est dérivé automatiquement (le client ne le choisit jamais), selon qu'un élève a déjà au
   * moins une inscription antérieure. "Alerte impayés antérieurs" (§4.2) n'est PAS implémentée
   * ici : aucune donnée financière n'existe encore (Lots 3-4), l'inventer violerait le principe
   * "aucune donnée inconnue ne doit être inventée".
   */
  async create(dto: CreateEnrollmentDto, actingUserId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const student = await this.studentsService.findOne(dto.studentId);
    const klass = await this.classesService.findOne(dto.classId);
    const academicYear = await this.academicYearsService.findOne(
      dto.academicYearId,
    );

    if (academicYear.statut === 'CLOTUREE') {
      throw new ConflictException(
        'Cette année scolaire est clôturée, aucune nouvelle inscription n’est possible.',
      );
    }
    if (klass.academicYearId !== dto.academicYearId) {
      throw new BadRequestException(
        'Cette classe n’appartient pas à l’année scolaire indiquée.',
      );
    }

    const existingActive = await this.prisma.enrollment.findFirst({
      where: {
        studentId: dto.studentId,
        academicYearId: dto.academicYearId,
        statut: 'ACTIVE',
      },
    });
    if (existingActive) {
      throw new ConflictException(
        'Cet élève a déjà une inscription active pour cette année scolaire (RG01).',
      );
    }

    const type =
      student.enrollments.length > 0 ? 'REINSCRIPTION' : 'INSCRIPTION';
    const sequenceNumber = await this.numberSequenceService.next(
      schoolId,
      'ENROLLMENT',
      dto.academicYearId,
    );
    const numero = `${academicYear.libelle}-${String(sequenceNumber).padStart(ENROLLMENT_NUMERO_DIGITS, '0')}`;

    const enrollment = await this.prisma.enrollment.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        classId: dto.classId,
        academicYearId: dto.academicYearId,
        numero,
        type,
      },
      include: ENROLLMENT_INCLUDE,
    });

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'ENROLLMENT_CREATE',
      entite: 'Enrollment',
      entiteId: enrollment.id,
      nouvelleValeur: enrollment,
    });

    return enrollment;
  }

  async cancel(id: string, dto: CancelEnrollmentDto, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.statut !== 'ACTIVE') {
      throw new ConflictException(
        'Seule une inscription active peut être annulée.',
      );
    }

    const updated = await this.prisma.enrollment.update({
      where: { id },
      data: { statut: 'ANNULEE', motifAnnulation: dto.motif },
      include: ENROLLMENT_INCLUDE,
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'ENROLLMENT_CANCEL',
      entite: 'Enrollment',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: updated,
    });

    return updated;
  }
}

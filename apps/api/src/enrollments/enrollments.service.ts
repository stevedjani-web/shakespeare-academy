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
import { InvoicesService } from '../invoices/invoices.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { CancelEnrollmentDto } from './dto/cancel-enrollment.dto';
import { ChangeClassDto } from './dto/change-class.dto';

const ENROLLMENT_NUMERO_DIGITS = 5;

const ENROLLMENT_INCLUDE = {
  student: { select: { id: true, matricule: true, nom: true, prenom: true } },
  class: { select: { id: true, nom: true, levelId: true } },
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
    private readonly invoicesService: InvoicesService,
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

    const derivedType =
      student.enrollments.length > 0 ? 'REINSCRIPTION' : 'INSCRIPTION';
    if (dto.type === 'INSCRIPTION' && derivedType === 'REINSCRIPTION') {
      throw new ConflictException(
        'Cet élève a déjà été inscrit à l’école : c’est une réinscription, pas une première inscription.',
      );
    }
    // Le type demandé (première année d'utilisation de l'outil : des élèves déjà scolarisés n'ont aucune
    // inscription enregistrée) l'emporte sur le type déduit, et le choix est journalisé.
    const type = dto.type ?? derivedType;
    const sequenceNumber = await this.numberSequenceService.next(
      schoolId,
      'ENROLLMENT',
      dto.academicYearId,
    );
    const numero = `${academicYear.libelle}-${String(sequenceNumber).padStart(ENROLLMENT_NUMERO_DIGITS, '0')}`;

    // Enveloppé dans une transaction avec la génération de facture (CA02) : une inscription
    // n'existe jamais sans sa facture (même vide si aucun frais obligatoire n'est configuré).
    const enrollment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.enrollment.create({
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

      await this.invoicesService.generateForEnrollment(tx, {
        schoolId,
        enrollmentId: created.id,
        academicYearId: dto.academicYearId,
        levelId: klass.levelId,
        enrollmentType: type,
      });

      return created;
    });

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'ENROLLMENT_CREATE',
      entite: 'Enrollment',
      entiteId: enrollment.id,
      nouvelleValeur: dto.type
        ? {
            ...enrollment,
            choixDuType: { choisi: dto.type, deduit: derivedType },
          }
        : enrollment,
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.enrollment.update({
        where: { id },
        data: { statut: 'ANNULEE', motifAnnulation: dto.motif },
        include: ENROLLMENT_INCLUDE,
      });
      await this.invoicesService.cancelForEnrollment(tx, id);
      return result;
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

  /**
   * Corrige une erreur de saisie sur la classe d'une inscription active (ex. mauvaise classe
   * sélectionnée) — jamais un changement de niveau : les frais déjà facturés (`InvoiceLine`) sont
   * un snapshot lié au niveau (RG03), une classe de niveau différent les rendrait incohérents.
   * Un vrai changement de niveau passe par annulation + nouvelle inscription.
   */
  async changeClass(id: string, dto: ChangeClassDto, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.statut !== 'ACTIVE') {
      throw new ConflictException(
        'Seule une inscription active peut être modifiée.',
      );
    }
    if (dto.classId === before.classId) {
      throw new ConflictException('Cet élève est déjà dans cette classe.');
    }

    const currentClass = await this.classesService.findOne(before.classId);
    const newClass = await this.classesService.findOne(dto.classId);
    if (newClass.academicYearId !== before.academicYearId) {
      throw new BadRequestException(
        'La nouvelle classe doit appartenir à la même année scolaire.',
      );
    }
    if (newClass.levelId !== currentClass.levelId) {
      throw new BadRequestException(
        'Le niveau de la nouvelle classe diffère de l’actuel — les frais déjà facturés ne correspondraient plus. Annulez cette inscription et recréez-en une nouvelle pour changer de niveau.',
      );
    }

    const updated = await this.prisma.enrollment.update({
      where: { id },
      data: { classId: dto.classId },
      include: ENROLLMENT_INCLUDE,
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'ENROLLMENT_CLASS_UPDATE',
      entite: 'Enrollment',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: updated,
    });

    return updated;
  }
}

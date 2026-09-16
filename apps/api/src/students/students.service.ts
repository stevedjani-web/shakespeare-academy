import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { NumberSequenceService } from '../common/number-sequence.service';
import { normalizeText } from '../common/normalize-text.util';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { AttachGuardianDto } from './dto/attach-guardian.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';

const STUDENT_INCLUDE = {
  studentGuardians: { include: { guardian: true } },
  enrollments: {
    include: {
      class: {
        include: {
          level: { include: { cycle: { include: { section: true } } } },
        },
      },
      academicYear: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

const MATRICULE_DIGITS = 6;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
    private readonly numberSequenceService: NumberSequenceService,
  ) {}

  async findAll(classId?: string, academicYearId?: string) {
    const schoolId = await this.schoolService.getDefaultId();
    if (classId || academicYearId) {
      return this.prisma.student.findMany({
        where: {
          schoolId,
          enrollments: {
            some: {
              statut: 'ACTIVE',
              classId: classId || undefined,
              academicYearId: academicYearId || undefined,
            },
          },
        },
        orderBy: { nom: 'asc' },
      });
    }
    return this.prisma.student.findMany({
      where: { schoolId },
      orderBy: { nom: 'asc' },
    });
  }

  /** Recherche anti-doublon (cadrage §4.1, §12) : matricule, nom/prénom, téléphone d'un responsable, date de naissance. */
  async search(query: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const normalized = normalizeText(query);
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(query.trim());

    const students = await this.prisma.student.findMany({
      where: {
        schoolId,
        OR: [
          { matricule: { contains: query, mode: 'insensitive' } },
          { nom: { contains: query, mode: 'insensitive' } },
          { prenom: { contains: query, mode: 'insensitive' } },
          ...(isDate ? [{ dateNaissance: new Date(query.trim()) }] : []),
          {
            studentGuardians: {
              some: { guardian: { telephone: { contains: query } } },
            },
          },
        ],
      },
      include: { studentGuardians: { include: { guardian: true } } },
      take: 20,
      orderBy: { nom: 'asc' },
    });

    // Filtre normalisé additionnel côté application (accents/casse) — Prisma ne sait pas normaliser
    // les accents nativement, `contains`/`insensitive` seul suffit rarement pour "Ndongo"/"Ndongó".
    return students.filter(
      (s) =>
        normalizeText(s.nom).includes(normalized) ||
        normalizeText(s.prenom).includes(normalized) ||
        normalizeText(s.matricule).includes(normalized) ||
        s.studentGuardians.some((sg) => sg.guardian.telephone.includes(query)),
    );
  }

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const student = await this.prisma.student.findFirst({
      where: { id, schoolId },
      include: STUDENT_INCLUDE,
    });
    if (!student) {
      throw new NotFoundException('Élève introuvable.');
    }
    return student;
  }

  /** D33 : doublon détecté = nom+prénom+date de naissance normalisés identiques, alerte non bloquante (409 sauf forcerCreation). */
  private async findPotentialDuplicate(
    schoolId: string,
    nom: string,
    prenom: string,
    dateNaissance: Date,
  ) {
    const candidates = await this.prisma.student.findMany({
      where: { schoolId, dateNaissance },
      select: {
        id: true,
        matricule: true,
        nom: true,
        prenom: true,
        dateNaissance: true,
      },
    });
    return candidates.find(
      (c) =>
        normalizeText(c.nom) === normalizeText(nom) &&
        normalizeText(c.prenom) === normalizeText(prenom),
    );
  }

  async create(dto: CreateStudentDto, actingUserId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const dateNaissance = new Date(dto.dateNaissance);

    const duplicate = await this.findPotentialDuplicate(
      schoolId,
      dto.nom,
      dto.prenom,
      dateNaissance,
    );
    if (duplicate && !dto.forcerCreation) {
      throw new ConflictException({
        message:
          'Un élève avec le même nom, prénom et date de naissance existe déjà. Confirmez avec forcerCreation si ce n’est pas un doublon.',
        doublonPotentiel: duplicate,
      });
    }

    let matricule = dto.matricule;
    if (matricule) {
      const existing = await this.prisma.student.findFirst({
        where: { schoolId, matricule },
      });
      if (existing) {
        throw new ConflictException('Ce matricule est déjà utilisé.');
      }
    } else {
      const numero = await this.numberSequenceService.next(
        schoolId,
        'MATRICULE',
      );
      matricule = String(numero).padStart(MATRICULE_DIGITS, '0');
    }

    const student = await this.prisma.$transaction(async (tx) => {
      const guardian = await tx.guardian.upsert({
        where: {
          schoolId_telephone: {
            schoolId,
            telephone: dto.responsable.telephone,
          },
        },
        update: {},
        create: {
          schoolId,
          nom: dto.responsable.nom,
          prenom: dto.responsable.prenom,
          telephone: dto.responsable.telephone,
          email: dto.responsable.email,
          profession: dto.responsable.profession,
          adresse: dto.responsable.adresse,
        },
      });

      const created = await tx.student.create({
        data: {
          schoolId,
          matricule: matricule,
          nom: dto.nom,
          prenom: dto.prenom,
          sexe: dto.sexe,
          dateNaissance,
          nationalite: dto.nationalite,
        },
      });

      await tx.studentGuardian.create({
        data: {
          studentId: created.id,
          guardianId: guardian.id,
          lien: dto.responsable.lien,
          prioritaire: true,
        },
      });

      return created;
    });

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'STUDENT_CREATE',
      entite: 'Student',
      entiteId: student.id,
      nouvelleValeur: student,
    });

    return this.findOne(student.id);
  }

  async update(id: string, dto: UpdateStudentDto, actingUserId: string) {
    const before = await this.findOne(id);
    const updated = await this.prisma.student.update({
      where: { id },
      data: {
        nom: dto.nom,
        prenom: dto.prenom,
        sexe: dto.sexe,
        dateNaissance: dto.dateNaissance
          ? new Date(dto.dateNaissance)
          : undefined,
        nationalite: dto.nationalite,
        statut: dto.statut,
      },
    });

    await this.auditService.log({
      schoolId: before.schoolId,
      userId: actingUserId,
      action: 'STUDENT_UPDATE',
      entite: 'Student',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: updated,
    });

    return this.findOne(id);
  }

  async attachGuardian(
    studentId: string,
    dto: AttachGuardianDto,
    actingUserId: string,
  ) {
    const student = await this.findOne(studentId);

    const guardian = await this.prisma.guardian.upsert({
      where: {
        schoolId_telephone: {
          schoolId: student.schoolId,
          telephone: dto.telephone,
        },
      },
      update: {},
      create: {
        schoolId: student.schoolId,
        nom: dto.nom,
        prenom: dto.prenom,
        telephone: dto.telephone,
        email: dto.email,
        profession: dto.profession,
        adresse: dto.adresse,
      },
    });

    const existingLink = await this.prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId, guardianId: guardian.id } },
    });
    if (existingLink) {
      throw new ConflictException(
        'Ce responsable est déjà rattaché à cet élève.',
      );
    }

    const link = await this.prisma.studentGuardian.create({
      data: {
        studentId,
        guardianId: guardian.id,
        lien: dto.lien,
        prioritaire: dto.prioritaire ?? false,
      },
      include: { guardian: true },
    });

    await this.auditService.log({
      schoolId: student.schoolId,
      userId: actingUserId,
      action: 'STUDENT_GUARDIAN_ATTACH',
      entite: 'Student',
      entiteId: studentId,
      nouvelleValeur: link,
    });

    return link;
  }

  async updateGuardian(
    guardianId: string,
    dto: UpdateGuardianDto,
    actingUserId: string,
  ) {
    const schoolId = await this.schoolService.getDefaultId();
    const before = await this.prisma.guardian.findFirst({
      where: { id: guardianId, schoolId },
    });
    if (!before) {
      throw new NotFoundException('Responsable introuvable.');
    }
    const updated = await this.prisma.guardian.update({
      where: { id: guardianId },
      data: dto,
    });

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'GUARDIAN_UPDATE',
      entite: 'Guardian',
      entiteId: guardianId,
      ancienneValeur: before,
      nouvelleValeur: updated,
    });

    return updated;
  }

  async detachGuardian(
    studentId: string,
    guardianId: string,
    actingUserId: string,
  ) {
    const student = await this.findOne(studentId);
    const link = await this.prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId, guardianId } },
    });
    if (!link) {
      throw new NotFoundException(
        'Ce responsable n’est pas rattaché à cet élève.',
      );
    }

    await this.prisma.studentGuardian.delete({ where: { id: link.id } });

    await this.auditService.log({
      schoolId: student.schoolId,
      userId: actingUserId,
      action: 'STUDENT_GUARDIAN_DETACH',
      entite: 'Student',
      entiteId: studentId,
      ancienneValeur: link,
    });

    return { success: true };
  }
}

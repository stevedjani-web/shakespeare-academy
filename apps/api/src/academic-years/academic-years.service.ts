import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';

@Injectable()
export class AcademicYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  async findAll() {
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.academicYear.findMany({
      where: { schoolId },
      orderBy: { dateDebut: 'desc' },
    });
  }

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const year = await this.prisma.academicYear.findFirst({
      where: { id, schoolId },
    });
    if (!year) {
      throw new NotFoundException('Année scolaire introuvable.');
    }
    return year;
  }

  async create(dto: CreateAcademicYearDto, actingUserId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const existing = await this.prisma.academicYear.findFirst({
      where: { schoolId, libelle: dto.libelle },
    });
    if (existing) {
      throw new ConflictException(
        'Une année scolaire avec ce libellé existe déjà.',
      );
    }
    if (new Date(dto.dateFin) <= new Date(dto.dateDebut)) {
      throw new BadRequestException(
        'La date de fin doit être postérieure à la date de début.',
      );
    }

    const year = await this.prisma.academicYear.create({
      data: {
        schoolId,
        libelle: dto.libelle,
        dateDebut: new Date(dto.dateDebut),
        dateFin: new Date(dto.dateFin),
        dateDebutInscriptions: dto.dateDebutInscriptions
          ? new Date(dto.dateDebutInscriptions)
          : null,
        dateFinInscriptions: dto.dateFinInscriptions
          ? new Date(dto.dateFinInscriptions)
          : null,
      },
    });

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'ACADEMIC_YEAR_CREATE',
      entite: 'AcademicYear',
      entiteId: year.id,
      nouvelleValeur: year,
    });

    return year;
  }

  async update(id: string, dto: UpdateAcademicYearDto, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.statut === 'CLOTUREE') {
      throw new ConflictException(
        'Une année scolaire clôturée ne peut plus être modifiée.',
      );
    }

    const year = await this.prisma.academicYear.update({
      where: { id },
      data: {
        libelle: dto.libelle,
        dateDebut: dto.dateDebut ? new Date(dto.dateDebut) : undefined,
        dateFin: dto.dateFin ? new Date(dto.dateFin) : undefined,
        dateDebutInscriptions: dto.dateDebutInscriptions
          ? new Date(dto.dateDebutInscriptions)
          : undefined,
        dateFinInscriptions: dto.dateFinInscriptions
          ? new Date(dto.dateFinInscriptions)
          : undefined,
      },
    });

    await this.auditService.log({
      schoolId: before.schoolId,
      userId: actingUserId,
      action: 'ACADEMIC_YEAR_UPDATE',
      entite: 'AcademicYear',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: year,
    });

    return year;
  }

  /**
   * §1.3 : une seule année active pour les opérations courantes. Contrairement à une bascule
   * automatique, l'activation échoue explicitement s'il en existe déjà une — la fermeture de
   * l'ancienne est un choix délibéré de la Direction, jamais un effet de bord silencieux.
   */
  async activate(id: string, actingUserId: string) {
    const year = await this.findOne(id);
    if (year.statut === 'CLOTUREE') {
      throw new ConflictException(
        'Une année clôturée ne peut pas être réactivée.',
      );
    }
    if (year.statut === 'ACTIVE') {
      return year;
    }

    const otherActive = await this.prisma.academicYear.findFirst({
      where: { schoolId: year.schoolId, statut: 'ACTIVE', id: { not: id } },
    });
    if (otherActive) {
      throw new ConflictException(
        `L'année "${otherActive.libelle}" est déjà active. Clôturez-la avant d'activer une nouvelle année.`,
      );
    }

    const updated = await this.prisma.academicYear.update({
      where: { id },
      data: { statut: 'ACTIVE' },
    });

    await this.auditService.log({
      schoolId: year.schoolId,
      userId: actingUserId,
      action: 'ACADEMIC_YEAR_ACTIVATE',
      entite: 'AcademicYear',
      entiteId: id,
      ancienneValeur: year,
      nouvelleValeur: updated,
    });

    return updated;
  }

  async close(id: string, actingUserId: string) {
    const year = await this.findOne(id);
    if (year.statut !== 'ACTIVE') {
      throw new ConflictException('Seule une année active peut être clôturée.');
    }

    const updated = await this.prisma.academicYear.update({
      where: { id },
      data: { statut: 'CLOTUREE' },
    });

    await this.auditService.log({
      schoolId: year.schoolId,
      userId: actingUserId,
      action: 'ACADEMIC_YEAR_CLOSE',
      entite: 'AcademicYear',
      entiteId: id,
      ancienneValeur: year,
      nouvelleValeur: updated,
    });

    return updated;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { AcademicYearsService } from '../academic-years/academic-years.service';
import { LevelsService } from '../levels/levels.service';
import { FeeTypesService } from '../fee-types/fee-types.service';
import { CreateFeeScheduleDto } from './dto/create-fee-schedule.dto';
import { UpdateFeeScheduleDto } from './dto/update-fee-schedule.dto';

const FEE_SCHEDULE_INCLUDE = {
  feeType: true,
  level: { select: { id: true, nom: true } },
  academicYear: { select: { id: true, libelle: true } },
  installments: { orderBy: { ordre: 'asc' as const } },
};

@Injectable()
export class FeeSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
    private readonly academicYearsService: AcademicYearsService,
    private readonly levelsService: LevelsService,
    private readonly feeTypesService: FeeTypesService,
  ) {}

  async findAll(academicYearId?: string, levelId?: string) {
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.feeSchedule.findMany({
      where: {
        schoolId,
        academicYearId: academicYearId || undefined,
        levelId: levelId || undefined,
      },
      include: FEE_SCHEDULE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const feeSchedule = await this.prisma.feeSchedule.findFirst({
      where: { id, schoolId },
      include: FEE_SCHEDULE_INCLUDE,
    });
    if (!feeSchedule) {
      throw new NotFoundException('Grille tarifaire introuvable.');
    }
    return feeSchedule;
  }

  /** Lève si le couple montant/installments ne correspond pas à FeeType.avecTranches. */
  private assertConsistentWithFeeType(
    avecTranches: boolean,
    montant: number | undefined,
    installments: CreateFeeScheduleDto['installments'],
  ) {
    if (avecTranches) {
      if (!installments || installments.length === 0) {
        throw new BadRequestException(
          'Ce type de frais est réparti en tranches : au moins une échéance est requise.',
        );
      }
      if (montant !== undefined) {
        throw new BadRequestException(
          'Ce type de frais est réparti en tranches : "montant" ne doit pas être fourni (le total est la somme des tranches).',
        );
      }
      const ordres = new Set(installments.map((i) => i.ordre));
      if (ordres.size !== installments.length) {
        throw new BadRequestException(
          'Les tranches doivent avoir des ordres distincts.',
        );
      }
    } else {
      if (montant === undefined) {
        throw new BadRequestException(
          'Ce type de frais n’est pas réparti en tranches : "montant" est requis.',
        );
      }
      if (installments && installments.length > 0) {
        throw new BadRequestException(
          'Ce type de frais n’est pas réparti en tranches : "installments" ne doit pas être fourni.',
        );
      }
    }
  }

  async create(dto: CreateFeeScheduleDto, actingUserId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    await this.academicYearsService.findOne(dto.academicYearId);
    await this.levelsService.findOne(dto.levelId);
    const feeType = await this.feeTypesService.findOne(dto.feeTypeId);

    this.assertConsistentWithFeeType(
      feeType.avecTranches,
      dto.montant,
      dto.installments,
    );

    const existing = await this.prisma.feeSchedule.findFirst({
      where: {
        academicYearId: dto.academicYearId,
        levelId: dto.levelId,
        feeTypeId: dto.feeTypeId,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Une grille tarifaire existe déjà pour ce type de frais, ce niveau et cette année scolaire.',
      );
    }

    const feeSchedule = await this.prisma.feeSchedule.create({
      data: {
        schoolId,
        academicYearId: dto.academicYearId,
        levelId: dto.levelId,
        feeTypeId: dto.feeTypeId,
        montant: dto.montant,
        installments: dto.installments
          ? {
              create: dto.installments.map((i) => ({
                libelle: i.libelle,
                montant: i.montant,
                ordre: i.ordre,
                dateLimite: new Date(i.dateLimite),
                delaiGraceJours: i.delaiGraceJours,
              })),
            }
          : undefined,
      },
      include: FEE_SCHEDULE_INCLUDE,
    });

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'FEE_SCHEDULE_CREATE',
      entite: 'FeeSchedule',
      entiteId: feeSchedule.id,
      nouvelleValeur: feeSchedule,
    });

    return feeSchedule;
  }

  async update(id: string, dto: UpdateFeeScheduleDto, actingUserId: string) {
    const before = await this.findOne(id);
    this.assertConsistentWithFeeType(
      before.feeType.avecTranches,
      dto.montant,
      dto.installments,
    );

    const feeSchedule = await this.prisma.$transaction(async (tx) => {
      if (dto.installments) {
        await tx.installmentSchedule.deleteMany({
          where: { feeScheduleId: id },
        });
      }
      return tx.feeSchedule.update({
        where: { id },
        data: {
          montant: dto.montant,
          installments: dto.installments
            ? {
                create: dto.installments.map((i) => ({
                  libelle: i.libelle,
                  montant: i.montant,
                  ordre: i.ordre,
                  dateLimite: new Date(i.dateLimite),
                  delaiGraceJours: i.delaiGraceJours,
                })),
              }
            : undefined,
        },
        include: FEE_SCHEDULE_INCLUDE,
      });
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'FEE_SCHEDULE_UPDATE',
      entite: 'FeeSchedule',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: feeSchedule,
    });

    return feeSchedule;
  }
}

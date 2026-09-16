import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { AuditService } from '../audit/audit.service';

/**
 * MVP mono-établissement : une seule ligne `School` existe. Le schéma prévoit `schoolId` partout
 * pour une future extension multi-site (cf. cahier de cadrage §11), mais aucun mécanisme de sélection
 * de tenant n'est construit tant qu'un seul site n'est réellement à gérer.
 */
@Injectable()
export class SchoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getDefault() {
    return this.prisma.school.findFirstOrThrow();
  }

  async getDefaultId(): Promise<string> {
    const school = await this.prisma.school.findFirst({ select: { id: true } });
    return school!.id;
  }

  async update(dto: UpdateSchoolDto, userId: string) {
    const school = await this.getDefault();
    const updated = await this.prisma.school.update({
      where: { id: school.id },
      data: dto,
    });
    await this.auditService.log({
      schoolId: school.id,
      userId,
      action: 'SCHOOL_SETTINGS_UPDATE',
      entite: 'School',
      entiteId: school.id,
      ancienneValeur: school,
      nouvelleValeur: updated,
    });
    return updated;
  }
}

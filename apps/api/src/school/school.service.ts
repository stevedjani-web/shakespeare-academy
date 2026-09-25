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

  /**
   * Identité publique de l'établissement (nom, adresse, téléphone, logo), pour les pages sans compte
   * (préinscription) et la marque de l'application. Rien d'autre : jamais un réglage ni un chiffre.
   */
  async getPublicProfile() {
    return this.prisma.school.findFirstOrThrow({
      select: { nom: true, adresse: true, telephone: true, logoUrl: true },
    });
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

  async updateLogo(logoUrl: string, userId: string) {
    const school = await this.getDefault();
    const updated = await this.prisma.school.update({
      where: { id: school.id },
      data: { logoUrl },
    });
    await this.auditService.log({
      schoolId: school.id,
      userId,
      action: 'SCHOOL_LOGO_UPDATE',
      entite: 'School',
      entiteId: school.id,
      ancienneValeur: { logoUrl: school.logoUrl },
      nouvelleValeur: { logoUrl },
    });
    return updated;
  }

  async updateSignature(signatureUrl: string, userId: string) {
    const school = await this.getDefault();
    const updated = await this.prisma.school.update({
      where: { id: school.id },
      data: { signatureUrl },
    });
    await this.auditService.log({
      schoolId: school.id,
      userId,
      action: 'SCHOOL_SIGNATURE_UPDATE',
      entite: 'School',
      entiteId: school.id,
      ancienneValeur: { signatureUrl: school.signatureUrl },
      nouvelleValeur: { signatureUrl },
    });
    return updated;
  }
}

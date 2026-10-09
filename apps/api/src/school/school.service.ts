import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { AuditService } from '../audit/audit.service';
import { percentToBp } from '../online-payments/service-fee.util';

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
   * Ce que voit un compte connecté : la fiche de l'établissement sans le nom du fichier du cachet (une pièce privée,
   * lue seulement par `/receipt-assets/cachet`), remplacé par un simple indicateur.
   */
  async getForClient() {
    const { cachetFichier, ...school } = await this.getDefault();
    return { ...school, cachetEnregistre: !!cachetFichier };
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

  async update(
    dto: UpdateSchoolDto,
    userId: string,
    permissions: readonly string[] = [],
  ) {
    const school = await this.getDefault();
    const { fraisServicePourcent, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    let feeChange: { avant: number; apres: number } | null = null;
    if (fraisServicePourcent !== undefined) {
      const bp = percentToBp(fraisServicePourcent);
      if (bp === null)
        throw new BadRequestException(
          'Le taux doit avoir au plus deux décimales.',
        );
      // Facturer des frais aux parents est une décision de la Direction du projet : un simple droit de réglage ne suffit pas.
      if (bp !== school.fraisServiceBp) {
        if (!permissions.includes('ONLINE_FEE_MANAGE'))
          throw new ForbiddenException(
            'Seul le Promoteur peut modifier le taux des frais de service.',
          );
        data.fraisServiceBp = bp;
        feeChange = { avant: school.fraisServiceBp, apres: bp };
      }
    }
    const updated = await this.prisma.school.update({
      where: { id: school.id },
      data,
    });
    if (feeChange) {
      await this.auditService.log({
        schoolId: school.id,
        userId,
        action: 'SCHOOL_SERVICE_FEE_UPDATE',
        entite: 'School',
        entiteId: school.id,
        ancienneValeur: { fraisServiceBp: feeChange.avant },
        nouvelleValeur: { fraisServiceBp: feeChange.apres },
      });
    }
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

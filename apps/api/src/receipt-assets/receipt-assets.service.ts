import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { optimizeImageFile } from '../common/optimize-image';
import {
  assetContentType,
  assetPath,
  isStoredAssetName,
  RECEIPT_ASSET_MAX_WIDTH,
  removeAsset,
} from './receipt-assets.storage';

export interface AssetFile {
  path: string;
  type: string;
}

/**
 * Cachet de l'établissement (un seul, réglé par la Direction ou l'Administrateur) et signature de chaque caissier
 * (réglée par lui-même) : les deux images qui sont posées automatiquement sur les reçus. Le fichier est vérifié et
 * réduit à l'enregistrement ; le journal ne garde que l'événement, jamais l'image.
 */
@Injectable()
export class ReceiptAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  private toFile(name: string | null): AssetFile {
    if (!isStoredAssetName(name)) {
      throw new NotFoundException('Aucune image enregistrée.');
    }
    return {
      path: assetPath(name as string),
      type: assetContentType(name as string),
    };
  }

  // ------------------------------------------------------------------ cachet de l'établissement

  async setCachet(filename: string, userId: string) {
    // Décode réellement l'image : un fichier qui n'en est pas une est supprimé et refusé (400).
    await optimizeImageFile(assetPath(filename), RECEIPT_ASSET_MAX_WIDTH);
    const school = await this.schoolService.getDefault();
    await this.prisma.school.update({
      where: { id: school.id },
      data: { cachetFichier: filename },
    });
    await removeAsset(school.cachetFichier);
    await this.audit.log({
      schoolId: school.id,
      userId,
      action: 'SCHOOL_CACHET_UPDATE',
      entite: 'School',
      entiteId: school.id,
    });
    return { enregistre: true };
  }

  async removeCachet(userId: string) {
    const school = await this.schoolService.getDefault();
    if (school.cachetFichier) {
      await this.prisma.school.update({
        where: { id: school.id },
        data: { cachetFichier: null },
      });
      await removeAsset(school.cachetFichier);
      await this.audit.log({
        schoolId: school.id,
        userId,
        action: 'SCHOOL_CACHET_REMOVE',
        entite: 'School',
        entiteId: school.id,
      });
    }
    return { enregistre: false };
  }

  async cachetFile(): Promise<AssetFile> {
    const school = await this.schoolService.getDefault();
    return this.toFile(school.cachetFichier);
  }

  // ------------------------------------------------------------------ signature d'un caissier

  async setSignature(userId: string, filename: string) {
    await optimizeImageFile(assetPath(filename), RECEIPT_ASSET_MAX_WIDTH);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, schoolId: true, signatureFichier: true },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { signatureFichier: filename },
    });
    await removeAsset(user.signatureFichier);
    await this.audit.log({
      schoolId: user.schoolId,
      userId,
      action: 'USER_SIGNATURE_UPDATE',
      entite: 'User',
      entiteId: userId,
    });
    return { enregistre: true };
  }

  async removeSignature(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, schoolId: true, signatureFichier: true },
    });
    if (user.signatureFichier) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { signatureFichier: null },
      });
      await removeAsset(user.signatureFichier);
      await this.audit.log({
        schoolId: user.schoolId,
        userId,
        action: 'USER_SIGNATURE_REMOVE',
        entite: 'User',
        entiteId: userId,
      });
    }
    return { enregistre: false };
  }

  async signatureFile(userId: string): Promise<AssetFile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { signatureFichier: true },
    });
    return this.toFile(user?.signatureFichier ?? null);
  }

  /** La signature du caissier qui a encaissé ce paiement (jamais celle de la personne qui imprime le reçu). */
  async signatureOfPayment(paymentId: string): Promise<AssetFile> {
    const schoolId = await this.schoolService.getDefaultId();
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, invoiceLine: { invoice: { schoolId } } },
      select: { recuParUserId: true },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable.');
    if (!payment.recuParUserId) {
      throw new NotFoundException('Aucune image enregistrée.');
    }
    return this.signatureFile(payment.recuParUserId);
  }
}

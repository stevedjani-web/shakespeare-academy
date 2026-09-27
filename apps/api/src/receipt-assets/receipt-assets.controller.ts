import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { ReceiptAssetsService, type AssetFile } from './receipt-assets.service';
import { receiptAssetMulterOptions } from './receipt-assets.storage';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

/** Envoie l'image sans jamais la laisser en cache partagé ni deviner son type : un cachet est une pièce sensible. */
function send(res: Response, file: AssetFile): StreamableFile {
  res.set({
    'Content-Type': file.type,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  return new StreamableFile(createReadStream(file.path));
}

// Cachet de l'établissement et signature du caissier posés automatiquement sur les reçus. Privés : jamais dans le
// dossier public, lus seulement par le personnel qui voit ou imprime des reçus.
@Controller('receipt-assets')
export class ReceiptAssetsController {
  constructor(private readonly assets: ReceiptAssetsService) {}

  // ------------------------------------------------------------------ cachet de l'établissement

  @Get('cachet')
  @RequireAnyPermission('FINANCE_READ', 'PAYMENT_CREATE', 'SETTINGS_READ')
  async cachet(@Res({ passthrough: true }) res: Response) {
    return send(res, await this.assets.cachetFile());
  }

  @Post('cachet')
  @RequirePermission('SETTINGS_MANAGE')
  @UseInterceptors(FileInterceptor('file', receiptAssetMulterOptions))
  uploadCachet(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier reçu.');
    return this.assets.setCachet(file.filename, user.id);
  }

  @Delete('cachet')
  @RequirePermission('SETTINGS_MANAGE')
  removeCachet(@CurrentUser() user: CurrentUserData) {
    return this.assets.removeCachet(user.id);
  }

  // ------------------------------------------------------------------ signature d'un caissier (la sienne)

  @Get('signature/me')
  @RequirePermission('PAYMENT_CREATE')
  async mySignature(
    @CurrentUser() user: CurrentUserData,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send(res, await this.assets.signatureFile(user.id));
  }

  @Post('signature/me')
  @RequirePermission('PAYMENT_CREATE')
  @UseInterceptors(FileInterceptor('file', receiptAssetMulterOptions))
  uploadMySignature(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier reçu.');
    return this.assets.setSignature(user.id, file.filename);
  }

  @Delete('signature/me')
  @RequirePermission('PAYMENT_CREATE')
  removeMySignature(@CurrentUser() user: CurrentUserData) {
    return this.assets.removeSignature(user.id);
  }

  // ------------------------------------------------------------------ signature du caissier d'un paiement

  @Get('signature/payment/:paymentId')
  @RequireAnyPermission('FINANCE_READ', 'PAYMENT_CREATE')
  async paymentSignature(
    @Param('paymentId') paymentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send(res, await this.assets.signatureOfPayment(paymentId));
  }
}

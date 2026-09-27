import { Module } from '@nestjs/common';
import { ReceiptAssetsController } from './receipt-assets.controller';
import { ReceiptAssetsService } from './receipt-assets.service';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';

/** Cachet de l'établissement et signature des caissiers, posés automatiquement sur les reçus. */
@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [ReceiptAssetsController],
  providers: [ReceiptAssetsService],
})
export class ReceiptAssetsModule {}

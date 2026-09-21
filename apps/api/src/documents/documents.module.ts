import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { NumberSequenceModule } from '../common/number-sequence.module';

/** Lot 19 : attestations de scolarité et cartes d'élève, avec numéro et vérification par QR code. */
@Module({
  imports: [AuditModule, SchoolModule, NumberSequenceModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

import { Module } from '@nestjs/common';
import { FamilyCollectionController } from './family-collection.controller';
import { FamilyCollectionService } from './family-collection.service';
import { FamilySubmissionLimiter } from './family-submission-limiter';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';

/** Collecte des informations des familles par lien de classe (D184 à D190). */
@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [FamilyCollectionController],
  providers: [FamilyCollectionService, FamilySubmissionLimiter],
})
export class FamilyCollectionModule {}

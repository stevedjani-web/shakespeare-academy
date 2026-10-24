import { Module } from '@nestjs/common';
import { TeacherOnboardingController } from './teacher-onboarding.controller';
import { TeacherOnboardingService } from './teacher-onboarding.service';
import { TeacherSubmissionLimiter } from './teacher-submission-limiter';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';

/** Collecte des informations des enseignants par un lien commun, validée par le secrétariat (24 octobre 2026). */
@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [TeacherOnboardingController],
  providers: [TeacherOnboardingService, TeacherSubmissionLimiter],
})
export class TeacherOnboardingModule {}

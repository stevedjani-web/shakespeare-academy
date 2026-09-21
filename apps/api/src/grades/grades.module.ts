import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GradesService } from './grades.service';
import { GradeResultsService } from './grade-results.service';
import { BulletinsService } from './bulletins.service';
import { GradeSettingsService } from './grade-settings.service';
import { GradesController } from './grades.controller';

/** Lot 15 : notes, évaluations et bulletins (vague 2, D51). */
@Module({
  imports: [AuditModule, SchoolModule, NotificationsModule],
  controllers: [GradesController],
  providers: [
    GradesService,
    GradeResultsService,
    BulletinsService,
    GradeSettingsService,
  ],
  exports: [BulletinsService],
})
export class GradesModule {}

import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { TimetableModule } from '../timetable/timetable.module';
import { TeacherCheckinsModule } from '../teacher-checkins/teacher-checkins.module';
import { PilotageService } from './pilotage.service';
import { PilotageController } from './pilotage.controller';

/** Lot 14 : pilotage 360° (addendum v1.1). Aucune donnée propre : tout est recalculé depuis les sources. */
@Module({
  imports: [AuditModule, SchoolModule, TimetableModule, TeacherCheckinsModule],
  controllers: [PilotageController],
  providers: [PilotageService],
})
export class PilotageModule {}

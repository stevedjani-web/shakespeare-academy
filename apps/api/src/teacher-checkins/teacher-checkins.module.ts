import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { TimetableModule } from '../timetable/timetable.module';
import { TeacherCheckinsService } from './teacher-checkins.service';
import { PointageCodesService } from './pointage-codes.service';
import { PointageCodesController, TeacherCheckinsController } from './teacher-checkins.controller';

/** Lot 10 : pointage des enseignants par QR code (addendum v1.1). */
@Module({
  imports: [AuditModule, SchoolModule, TimetableModule],
  controllers: [TeacherCheckinsController, PointageCodesController],
  providers: [TeacherCheckinsService, PointageCodesService],
})
export class TeacherCheckinsModule {}

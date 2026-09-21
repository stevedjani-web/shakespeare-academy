import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { TimetableModule } from '../timetable/timetable.module';
import { AttendanceService } from './attendance.service';
import { JustificationsService } from './justifications.service';
import { AbsenceReasonsController, AttendanceController } from './attendance.controller';

/** Lot 9 : assiduité des élèves (addendum v1.1). */
@Module({
  imports: [AuditModule, SchoolModule, TimetableModule],
  controllers: [AttendanceController, AbsenceReasonsController],
  providers: [AttendanceService, JustificationsService],
})
export class AttendanceModule {}

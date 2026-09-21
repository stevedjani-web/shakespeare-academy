import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { TimetablesService } from './timetables.service';
import { OccurrencesService } from './occurrences.service';
import {
  TimetableEntriesController,
  TimetableExceptionsController,
  TimetableViewController,
  TimetablesController,
} from './timetable.controller';

/** Lot 8 : emploi du temps (addendum v1.1). */
@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [
    TimetablesController,
    TimetableEntriesController,
    TimetableExceptionsController,
    TimetableViewController,
  ],
  providers: [TimetablesService, OccurrencesService],
  exports: [OccurrencesService],
})
export class TimetableModule {}

import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { PedagogyController } from './pedagogy.controller';
import { PedagogyService } from './pedagogy.service';
import { ReferentialService } from './referential.service';
import { CalendarService } from './calendar.service';
import { TeachersService } from './teachers.service';
import {
  RoomsController,
  SubjectsController,
  TimeSlotsController,
} from './referential.controller';
import { CalendarEventsController, TermsController } from './calendar.controller';
import { AssignmentsController, TeachersController } from './teachers.controller';

/** Lot 7 : référentiel pédagogique et personnel (addendum v1.1). */
@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [
    PedagogyController,
    TimeSlotsController,
    RoomsController,
    SubjectsController,
    TermsController,
    CalendarEventsController,
    TeachersController,
    AssignmentsController,
  ],
  providers: [PedagogyService, ReferentialService, CalendarService, TeachersService],
})
export class PedagogyModule {}

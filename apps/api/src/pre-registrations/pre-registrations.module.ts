import { Module } from '@nestjs/common';
import { PreRegistrationsService } from './pre-registrations.service';
import { PreRegistrationsController } from './pre-registrations.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { NumberSequenceModule } from '../common/number-sequence.module';
import { StudentsModule } from '../students/students.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { ClassesModule } from '../classes/classes.module';

/** Lot 21 : préinscription en ligne (demande publique, examen et conversion en inscription réelle). */
@Module({
  imports: [
    AuditModule,
    SchoolModule,
    NumberSequenceModule,
    StudentsModule,
    EnrollmentsModule,
    ClassesModule,
  ],
  controllers: [PreRegistrationsController],
  providers: [PreRegistrationsService],
  exports: [PreRegistrationsService],
})
export class PreRegistrationsModule {}

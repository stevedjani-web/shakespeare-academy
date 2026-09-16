import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentsController } from './enrollments.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { NumberSequenceModule } from '../common/number-sequence.module';
import { StudentsModule } from '../students/students.module';
import { ClassesModule } from '../classes/classes.module';
import { AcademicYearsModule } from '../academic-years/academic-years.module';

@Module({
  imports: [
    AuditModule,
    SchoolModule,
    NumberSequenceModule,
    StudentsModule,
    ClassesModule,
    AcademicYearsModule,
  ],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
})
export class EnrollmentsModule {}

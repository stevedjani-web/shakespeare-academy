import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { NumberSequenceModule } from '../common/number-sequence.module';
import { FinancialStatusService } from '../financial-status/financial-status.service';
import { PrismaModule } from '../prisma/prisma.module';
import { GradesModule } from '../grades/grades.module';

@Module({
  imports: [
    AuditModule,
    SchoolModule,
    NumberSequenceModule,
    PrismaModule,
    GradesModule,
  ],
  controllers: [StudentsController],
  providers: [StudentsService, FinancialStatusService],
  exports: [StudentsService, FinancialStatusService],
})
export class StudentsModule {}

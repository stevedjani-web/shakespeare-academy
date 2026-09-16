import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { NumberSequenceModule } from '../common/number-sequence.module';

@Module({
  imports: [AuditModule, SchoolModule, NumberSequenceModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}

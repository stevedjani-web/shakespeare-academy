import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';

@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}

import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { SchoolModule } from '../school/school.module';
import { StudentsModule } from '../students/students.module';
import { BankDepositsModule } from '../bank-deposits/bank-deposits.module';

@Module({
  imports: [SchoolModule, StudentsModule, BankDepositsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

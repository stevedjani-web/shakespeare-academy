import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { SchoolModule } from '../school/school.module';
import { AuditModule } from '../audit/audit.module';
import { FeeTypesModule } from '../fee-types/fee-types.module';

@Module({
  imports: [SchoolModule, AuditModule, FeeTypesModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}

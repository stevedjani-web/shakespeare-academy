import { Module } from '@nestjs/common';
import { FeeTypesService } from './fee-types.service';
import { FeeTypesController } from './fee-types.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';

@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [FeeTypesController],
  providers: [FeeTypesService],
  exports: [FeeTypesService],
})
export class FeeTypesModule {}

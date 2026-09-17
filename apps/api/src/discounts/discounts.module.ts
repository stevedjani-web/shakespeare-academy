import { Module } from '@nestjs/common';
import { DiscountsService } from './discounts.service';
import { DiscountsController } from './discounts.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';

@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [DiscountsController],
  providers: [DiscountsService],
  exports: [DiscountsService],
})
export class DiscountsModule {}

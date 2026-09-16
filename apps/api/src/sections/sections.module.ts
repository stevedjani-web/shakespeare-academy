import { Module } from '@nestjs/common';
import { SectionsService } from './sections.service';
import { SectionsController } from './sections.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';

@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [SectionsController],
  providers: [SectionsService],
  exports: [SectionsService],
})
export class SectionsModule {}

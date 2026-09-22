import { Module } from '@nestjs/common';
import { FeeSchedulesService } from './fee-schedules.service';
import { FeeSchedulesController } from './fee-schedules.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { AcademicYearsModule } from '../academic-years/academic-years.module';
import { LevelsModule } from '../levels/levels.module';
import { FeeTypesModule } from '../fee-types/fee-types.module';

@Module({
  imports: [
    AuditModule,
    SchoolModule,
    AcademicYearsModule,
    LevelsModule,
    FeeTypesModule,
  ],
  controllers: [FeeSchedulesController],
  providers: [FeeSchedulesService],
  exports: [FeeSchedulesService],
})
export class FeeSchedulesModule {}

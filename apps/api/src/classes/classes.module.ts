import { Module } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { LevelsModule } from '../levels/levels.module';
import { AcademicYearsModule } from '../academic-years/academic-years.module';

@Module({
  imports: [AuditModule, SchoolModule, LevelsModule, AcademicYearsModule],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}

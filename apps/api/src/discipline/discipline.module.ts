import { Module } from '@nestjs/common';
import { DisciplineService } from './discipline.service';
import { DisciplineController } from './discipline.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { NotificationsModule } from '../notifications/notifications.module';

/** Lot 20 : discipline (incidents, sanctions, convocations, valorisations). */
@Module({
  imports: [AuditModule, SchoolModule, NotificationsModule],
  controllers: [DisciplineController],
  providers: [DisciplineService],
  exports: [DisciplineService],
})
export class DisciplineModule {}

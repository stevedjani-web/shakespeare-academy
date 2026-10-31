import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { CanteenService } from './canteen.service';
import { CanteenController } from './canteen.controller';

/** Cantine (30 octobre 2026) : jours payés d'avance, vente avec reçu, liste des enfants attendus. */
@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [CanteenController],
  providers: [CanteenService],
  exports: [CanteenService],
})
export class CanteenModule {}

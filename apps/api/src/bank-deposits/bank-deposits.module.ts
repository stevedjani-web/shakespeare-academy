import { Module } from '@nestjs/common';
import { BankDepositsController } from './bank-deposits.controller';
import { BankDepositsService } from './bank-deposits.service';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';

/** Versement en banque des espèces encaissées : déclaration avec bordereau, vérification par une deuxième personne. */
@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [BankDepositsController],
  providers: [BankDepositsService],
  exports: [BankDepositsService],
})
export class BankDepositsModule {}

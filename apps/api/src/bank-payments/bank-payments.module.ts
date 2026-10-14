import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import {
  BankPaymentsController,
  SchoolBankAccountsController,
} from './bank-payments.controller';
import { BankPaymentsService } from './bank-payments.service';
import { SchoolBankAccountsService } from './school-bank-accounts.service';

/**
 * Paiement par banque (virement, dépôt, chèque) : déclaration avec preuve par le parent ou le secrétariat, confirmation du
 * crédit par le Promoteur, validation par le secrétariat. Le côté parent (`/portal/bank-payments`) vit dans le module du
 * portail, qui importe celui-ci.
 */
@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [BankPaymentsController, SchoolBankAccountsController],
  providers: [BankPaymentsService, SchoolBankAccountsService],
  exports: [BankPaymentsService],
})
export class BankPaymentsModule {}

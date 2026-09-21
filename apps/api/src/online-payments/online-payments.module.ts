import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { OnlinePaymentsService } from './online-payments.service';
import { OnlinePaymentsController } from './online-payments.controller';
import { PawaPayWebhookController } from './pawapay-webhook.controller';
import { PawaPaySignatureVerifier } from './pawapay-signature.verifier';
import { PawaPayProvider } from './pawapay.provider';
import { RealPawaPayPublicKeyProvider } from './pawapay-public-key.provider';
import { ONLINE_PAYMENT_PROVIDER } from './online-payment-provider.interface';
import { PAWAPAY_PUBLIC_KEY_PROVIDER } from './pawapay-public-key-provider.interface';

/** Lot 17 : paiement des frais par les parents (Mobile Money, PawaPay). */
@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [OnlinePaymentsController, PawaPayWebhookController],
  providers: [
    OnlinePaymentsService,
    PawaPaySignatureVerifier,
    { provide: ONLINE_PAYMENT_PROVIDER, useClass: PawaPayProvider },
    {
      provide: PAWAPAY_PUBLIC_KEY_PROVIDER,
      useClass: RealPawaPayPublicKeyProvider,
    },
  ],
  exports: [OnlinePaymentsService],
})
export class OnlinePaymentsModule {}

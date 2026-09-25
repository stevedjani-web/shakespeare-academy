import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/main';
import { PUSH_SENDER } from '../../src/notifications/push-sender.interface';
import { FakePushSender } from './fake-push-sender';
import { ONLINE_PAYMENT_PROVIDER } from '../../src/online-payments/online-payment-provider.interface';
import { PAWAPAY_PUBLIC_KEY_PROVIDER } from '../../src/online-payments/pawapay-public-key-provider.interface';
import { FakeOnlinePaymentProvider } from './fake-online-payment-provider';
import { FakePawaPayPublicKeyProvider } from './fake-pawapay-public-key.provider';
import { ASSISTANT_PROVIDER } from '../../src/assistant/assistant-provider.interface';
import { FakeAssistantProvider } from './fake-assistant-provider';

export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    // Aucun envoi push réel dans la suite de tests (Lot 12) : un faux service enregistre les envois.
    .overrideProvider(PUSH_SENDER)
    .useValue(new FakePushSender())
    // Lot 17 : aucun appel réel à PawaPay dans la suite de tests. Le faux fournisseur est retrouvé par les tests
    // avec app.get(ONLINE_PAYMENT_PROVIDER).
    .overrideProvider(ONLINE_PAYMENT_PROVIDER)
    .useValue(new FakeOnlinePaymentProvider())
    .overrideProvider(PAWAPAY_PUBLIC_KEY_PROVIDER)
    .useValue(new FakePawaPayPublicKeyProvider())
    // Lot 22 : aucun appel réel à l'IA dans la suite de tests ; le faux se retrouve avec app.get(ASSISTANT_PROVIDER).
    .overrideProvider(ASSISTANT_PROVIDER)
    .useValue(new FakeAssistantProvider())
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    rawBody: true,
  });
  configureApp(app);
  await app.init();
  return app;
}

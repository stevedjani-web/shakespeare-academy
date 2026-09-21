import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/main';
import { PUSH_SENDER } from '../../src/notifications/push-sender.interface';
import { FakePushSender } from './fake-push-sender';

export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    // Aucun envoi push réel dans la suite de tests (Lot 12) : un faux service enregistre les envois.
    .overrideProvider(PUSH_SENDER)
    .useValue(new FakePushSender())
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

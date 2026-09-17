import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

export function configureApp(app: NestExpressApplication) {
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  // `process.cwd()`, jamais `__dirname` : en dev, `main.ts` tourne depuis `src/` (ts-node/SWC) alors
  // qu'en production c'est `dist/src/main.js` (voir CLAUDE.md sur `dist/src` vs `dist/`) — le nombre
  // de niveaux à remonter diffère entre les deux, alors que `process.cwd()` (répertoire d'où `npm
  // run` / le conteneur Docker démarre, toujours la racine `apps/api`) reste correct dans les deux cas.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  await app.listen(process.env.PORT ?? 3001);
}

// `require.main === module` : n'écoute un vrai port que lorsque ce fichier est exécuté
// directement (`node dist/main`), jamais quand les tests e2e importent `configureApp` d'ici.
if (require.main === module) {
  void bootstrap();
}

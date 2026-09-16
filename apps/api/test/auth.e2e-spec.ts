import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, TEST_ADMIN_PASSWORD } from './utils/fixtures';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = 'admin@shakespeareacademy.cg';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health est public, sans jeton', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok' });
  });

  it('refuse toute route protégée sans jeton (401)', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('POST /auth/login réussit avec les bons identifiants et pose un cookie de rafraîchissement', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, motDePasse: TEST_ADMIN_PASSWORD })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(adminEmail);
    expect(res.body.user.doitChangerMotDePasse).toBe(true);
    const cookies = res.headers['set-cookie'];
    expect(cookies.some((c: string) => c.startsWith('refresh_token='))).toBe(
      true,
    );
  });

  it('POST /auth/login échoue avec un mauvais mot de passe (401), sans révéler la cause précise', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, motDePasse: 'mauvais-mot-de-passe' })
      .expect(401);
  });

  it('verrouille le compte après 5 échecs consécutifs, même avec le bon mot de passe ensuite', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adminEmail, motDePasse: 'mauvais' })
        .expect(401);
    }

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, motDePasse: TEST_ADMIN_PASSWORD })
      .expect(403);
    expect(res.body.message).toMatch(/verrouillé/i);
  });

  it('permet de renouveler le jeton d’accès via le cookie de rafraîchissement, puis révoque l’ancien', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, motDePasse: TEST_ADMIN_PASSWORD })
      .expect(201);

    const refreshCookie = loginRes.headers['set-cookie'].find((c: string) =>
      c.startsWith('refresh_token='),
    );

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(201);
    expect(refreshRes.body.accessToken).toEqual(expect.any(String));

    // L'ancien jeton de rafraîchissement a été révoqué par la rotation : le réutiliser échoue.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);
  });

  it('POST /auth/logout révoque le jeton de rafraîchissement courant', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, motDePasse: TEST_ADMIN_PASSWORD })
      .expect(201);
    const refreshCookie = loginRes.headers['set-cookie'].find((c: string) =>
      c.startsWith('refresh_token='),
    );

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', refreshCookie)
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);
  });

  it('PATCH /auth/change-password change bien le mot de passe et lève le drapeau doitChangerMotDePasse', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, motDePasse: TEST_ADMIN_PASSWORD })
      .expect(201);
    const accessToken = loginRes.body.accessToken;

    await request(app.getHttpServer())
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ancienMotDePasse: TEST_ADMIN_PASSWORD,
        nouveauMotDePasse: 'NouveauMotDePasse123!',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, motDePasse: TEST_ADMIN_PASSWORD })
      .expect(401);

    const secondLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, motDePasse: 'NouveauMotDePasse123!' })
      .expect(201);
    expect(secondLogin.body.user.doitChangerMotDePasse).toBe(false);
  });

  it('un compte désactivé ne peut plus se connecter, même avec le bon mot de passe', async () => {
    const admin = await prisma.user.findFirstOrThrow({
      where: { email: adminEmail },
    });
    await prisma.user.update({
      where: { id: admin.id },
      data: { statut: 'INACTIF' },
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, motDePasse: TEST_ADMIN_PASSWORD })
      .expect(403);
  });
});

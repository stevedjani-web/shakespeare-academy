import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

describe('Paramétrage établissement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@shakespeareacademy.cg',
        motDePasse: 'ChangeMe123!',
      })
      .expect(201);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /school est lisible par tout utilisateur authentifié', async () => {
    const res = await request(app.getHttpServer())
      .get('/school')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.devise).toBe('XAF');
    expect(res.body.fuseauHoraire).toBe('Africa/Brazzaville');
  });

  it('GET /school/public est ouvert sans compte et ne renvoie que l’identité de l’établissement', async () => {
    const school = await prisma.school.findFirstOrThrow();
    await prisma.school.update({
      where: { id: school.id },
      data: {
        adresse: '12 avenue de la Paix',
        telephone: '06 853 8686',
        logoUrl: '/uploads/school/logo.png',
        seuilImpayeCritiqueFcfa: 250000,
        directeurNom: 'Jean Dupont',
      },
    });
    const res = await request(app.getHttpServer())
      .get('/school/public')
      .expect(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'adresse',
      'logoUrl',
      'nom',
      'telephone',
    ]);
    expect(res.body.nom).toBe(school.nom);
    expect(res.body.logoUrl).toBe('/uploads/school/logo.png');
    expect(JSON.stringify(res.body)).not.toContain('250000');
    expect(JSON.stringify(res.body)).not.toContain('Dupont');
  });

  it('PATCH /school exige SETTINGS_MANAGE', async () => {
    const school = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      school.id,
      'SECRETAIRE_CAISSIER',
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, motDePasse })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/school')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ nom: 'Nouveau nom' })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/school')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nom: 'Shakespeare Academy — Pointe-Noire' })
      .expect(200);
  });

  const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  it('POST /school/logo enregistre le logo et exige SETTINGS_MANAGE', async () => {
    const school = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      school.id,
      'SECRETAIRE_CAISSIER',
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, motDePasse })
      .expect(201);

    await request(app.getHttpServer())
      .post('/school/logo')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .attach('file', TINY_PNG, 'logo.png')
      .expect(403);

    const res = await request(app.getHttpServer())
      .post('/school/logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', TINY_PNG, 'logo.png')
      .expect(201);
    expect(res.body.logoUrl).toMatch(/^\/uploads\/school\/.+\.png$/);
  });

  it('POST /school/logo refuse un format non autorisé (400)', async () => {
    await request(app.getHttpServer())
      .post('/school/logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('not an image'), 'logo.txt')
      .expect(400);
  });
});

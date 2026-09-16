import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures } from './utils/fixtures';

describe("Journal d'audit — RG15 (e2e)", () => {
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

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${adminToken}`);
  }

  it('journalise la connexion réussie et la création d’une section, avec ancienne/nouvelle valeur', async () => {
    const section = await auth(
      request(app.getHttpServer()).post('/sections'),
    ).send({
      code: 'FRANCOPHONE',
      nom: 'Section francophone',
    });

    const logs = await auth(request(app.getHttpServer()).get('/audit-logs'));
    const actions = logs.body.map((log: { action: string }) => log.action);
    expect(actions).toEqual(
      expect.arrayContaining(['USER_LOGIN_SUCCESS', 'SECTION_CREATE']),
    );

    const sectionLog = logs.body.find(
      (log: { action: string }) => log.action === 'SECTION_CREATE',
    );
    expect(sectionLog.entiteId).toBe(section.body.id);
    expect(sectionLog.nouvelleValeur.code).toBe('FRANCOPHONE');
    expect(sectionLog.ancienneValeur).toBeNull();
  });

  it('ne journalise jamais le hash du mot de passe lors d’une réinitialisation', async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: 'SECRETAIRE_CAISSIER' },
    });
    const created = await auth(
      request(app.getHttpServer()).post('/users'),
    ).send({
      nom: 'A',
      prenom: 'B',
      email: 'reset@test.local',
      motDePasse: 'MotDePasse123!',
      roleId: role.id,
    });
    await auth(
      request(app.getHttpServer()).patch(
        `/users/${created.body.id}/reset-password`,
      ),
    ).send({
      nouveauMotDePasse: 'MotDeSecours123!',
    });

    const logs = await auth(
      request(app.getHttpServer()).get('/audit-logs?entite=User'),
    );
    const resetLog = logs.body.find(
      (log: { action: string }) => log.action === 'USER_PASSWORD_RESET',
    );
    expect(JSON.stringify(resetLog)).not.toMatch(/MotDeSecours123!|\$argon2/);
  });
});

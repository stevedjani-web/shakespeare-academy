import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures } from './utils/fixtures';

describe('Rôles et permissions (e2e)', () => {
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

  it('liste les 5 rôles du référentiel avec leurs permissions Lot 1', async () => {
    const res = await auth(request(app.getHttpServer()).get('/roles'));
    expect(res.status).toBe(200);
    const codes = res.body.map((r: { code: string }) => r.code).sort();
    expect(codes).toEqual([
      'ADMINISTRATEUR',
      'AUDITEUR',
      'COMPTABLE',
      'DIRECTION',
      'SECRETAIRE_CAISSIER',
    ]);
    const admin = res.body.find(
      (r: { code: string }) => r.code === 'ADMINISTRATEUR',
    );
    expect(admin.permissions).toEqual(
      expect.arrayContaining(['USER_MANAGE', 'ROLE_MANAGE']),
    );
  });

  it('liste le catalogue de permissions', async () => {
    const res = await auth(request(app.getHttpServer()).get('/permissions'));
    expect(res.status).toBe(200);
    expect(res.body.map((p: { code: string }) => p.code)).toEqual(
      expect.arrayContaining(['SETTINGS_MANAGE', 'AUDIT_LOG_READ']),
    );
  });

  it('crée un rôle personnalisé puis lui assigne des permissions', async () => {
    const role = await auth(request(app.getHttpServer()).post('/roles')).send({
      code: 'SURVEILLANT',
      nom: 'Surveillant général',
    });
    expect(role.status).toBe(201);
    expect(role.body.permissions).toEqual([]);

    const updated = await auth(
      request(app.getHttpServer()).put(`/roles/${role.body.id}/permissions`),
    ).send({
      permissionCodes: ['AUDIT_LOG_READ'],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.permissions).toEqual(['AUDIT_LOG_READ']);
  });

  it('refuse une permission inconnue lors de l’assignation (400)', async () => {
    const role = await auth(request(app.getHttpServer()).post('/roles')).send({
      code: 'SURVEILLANT2',
      nom: 'Surveillant général',
    });
    await auth(
      request(app.getHttpServer()).put(`/roles/${role.body.id}/permissions`),
    )
      .send({ permissionCodes: ['CODE_INEXISTANT'] })
      .expect(400);
  });

  it('refuse deux rôles avec le même code', async () => {
    await auth(request(app.getHttpServer()).post('/roles'))
      .send({ code: 'SURVEILLANT3', nom: 'A' })
      .expect(201);
    await auth(request(app.getHttpServer()).post('/roles'))
      .send({ code: 'SURVEILLANT3', nom: 'B' })
      .expect(409);
  });
});

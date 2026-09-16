import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures } from './utils/fixtures';

describe('Années scolaires (e2e)', () => {
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

  it('crée une année scolaire en statut BROUILLON par défaut', async () => {
    const res = await auth(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-07-15',
    });
    expect(res.status).toBe(201);
    expect(res.body.statut).toBe('BROUILLON');
  });

  it('rejette une date de fin antérieure ou égale à la date de début (400)', async () => {
    await auth(request(app.getHttpServer()).post('/academic-years'))
      .send({
        libelle: '2026-2027',
        dateDebut: '2026-09-01',
        dateFin: '2026-08-01',
      })
      .expect(400);
  });

  it('refuse deux années scolaires actives simultanément', async () => {
    const year1 = await auth(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2025-2026',
      dateDebut: '2025-09-01',
      dateFin: '2026-07-15',
    });
    const year2 = await auth(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-07-15',
    });

    await auth(
      request(app.getHttpServer()).post(
        `/academic-years/${year1.body.id}/activate`,
      ),
    ).expect(201);

    const res = await auth(
      request(app.getHttpServer()).post(
        `/academic-years/${year2.body.id}/activate`,
      ),
    );
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/2025-2026/);
  });

  it('permet de clôturer une année active puis d’en activer une nouvelle', async () => {
    const year1 = await auth(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2025-2026',
      dateDebut: '2025-09-01',
      dateFin: '2026-07-15',
    });
    const year2 = await auth(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-07-15',
    });

    await auth(
      request(app.getHttpServer()).post(
        `/academic-years/${year1.body.id}/activate`,
      ),
    ).expect(201);
    await auth(
      request(app.getHttpServer()).post(
        `/academic-years/${year1.body.id}/close`,
      ),
    ).expect(201);
    await auth(
      request(app.getHttpServer()).post(
        `/academic-years/${year2.body.id}/activate`,
      ),
    ).expect(201);

    const refreshed = await auth(
      request(app.getHttpServer()).get(`/academic-years/${year2.body.id}`),
    );
    expect(refreshed.body.statut).toBe('ACTIVE');
  });

  it('interdit de clôturer une année qui n’est pas active (BROUILLON)', async () => {
    const year = await auth(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-07-15',
    });
    await auth(
      request(app.getHttpServer()).post(
        `/academic-years/${year.body.id}/close`,
      ),
    ).expect(409);
  });

  it('interdit de modifier une année clôturée', async () => {
    const year = await auth(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2025-2026',
      dateDebut: '2025-09-01',
      dateFin: '2026-07-15',
    });
    await auth(
      request(app.getHttpServer()).post(
        `/academic-years/${year.body.id}/activate`,
      ),
    ).expect(201);
    await auth(
      request(app.getHttpServer()).post(
        `/academic-years/${year.body.id}/close`,
      ),
    ).expect(201);

    await auth(
      request(app.getHttpServer()).patch(`/academic-years/${year.body.id}`),
    )
      .send({ libelle: '2025-2026 modifiée' })
      .expect(409);
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

describe('Sorties financières (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let directionToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const school = await seedBaseFixtures(prisma);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@shakespeareacademy.cg', motDePasse: 'ChangeMe123!' })
      .expect(201);
    adminToken = login.body.accessToken;

    const { user, motDePasse } = await createUserWithRole(prisma, school.id, 'DIRECTION');
    const dirLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, motDePasse })
      .expect(201);
    directionToken = dirLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${adminToken}`);
  }
  function authDir(req: request.Test) {
    return req.set('Authorization', `Bearer ${directionToken}`);
  }

  it('enregistre une sortie EN_ATTENTE puis Direction l’approuve', async () => {
    const created = await auth(request(app.getHttpServer()).post('/expenses')).send({
      categorie: 'ACHAT_MATERIEL',
      montant: 50000,
      description: 'Achat de craie et cahiers',
    });
    expect(created.status).toBe(201);
    expect(created.body.statut).toBe('EN_ATTENTE');

    const approved = await authDir(
      request(app.getHttpServer()).post(`/expenses/${created.body.id}/approve`),
    );
    expect(approved.status).toBe(201);
    expect(approved.body.statut).toBe('APPROUVEE');
  });

  it('rejette une sortie avec motif', async () => {
    const created = await auth(request(app.getHttpServer()).post('/expenses')).send({
      categorie: 'PAIEMENT_FACTURE',
      montant: 20000,
      description: 'Facture électricité',
    });
    const rejected = await authDir(
      request(app.getHttpServer()).post(`/expenses/${created.body.id}/reject`),
    ).send({ motif: 'Montant à vérifier' });
    expect(rejected.status).toBe(201);
    expect(rejected.body.statut).toBe('REJETEE');
  });

  it('refuse une catégorie hors liste fermée (400)', async () => {
    await auth(request(app.getHttpServer()).post('/expenses'))
      .send({ categorie: 'INVENTEE', montant: 1000, description: 'Test' })
      .expect(400);
  });

  it('refuse à Administrateur d’approuver une sortie (403) — Direction uniquement', async () => {
    const created = await auth(request(app.getHttpServer()).post('/expenses')).send({
      categorie: 'AUTRE',
      montant: 5000,
      description: 'Divers',
    });
    await auth(request(app.getHttpServer()).post(`/expenses/${created.body.id}/approve`)).expect(403);
  });

  it('refuse d’approuver deux fois la même sortie (409)', async () => {
    const created = await auth(request(app.getHttpServer()).post('/expenses')).send({
      categorie: 'VERSEMENT_BANQUE',
      montant: 100000,
      description: 'Dépôt banque',
    });
    await authDir(request(app.getHttpServer()).post(`/expenses/${created.body.id}/approve`)).expect(201);
    await authDir(request(app.getHttpServer()).post(`/expenses/${created.body.id}/approve`)).expect(409);
  });

  it('filtre les sorties par statut', async () => {
    const created = await auth(request(app.getHttpServer()).post('/expenses')).send({
      categorie: 'PAIEMENT_SALAIRE',
      montant: 200000,
      description: 'Salaire septembre',
    });
    await authDir(request(app.getHttpServer()).post(`/expenses/${created.body.id}/approve`));

    const approved = await auth(request(app.getHttpServer()).get('/expenses?statut=APPROUVEE'));
    expect(approved.body.map((e: { id: string }) => e.id)).toEqual([created.body.id]);

    const pending = await auth(request(app.getHttpServer()).get('/expenses?statut=EN_ATTENTE'));
    expect(pending.body).toHaveLength(0);
  });
});

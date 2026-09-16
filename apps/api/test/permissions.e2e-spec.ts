import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

/**
 * CA14 : un utilisateur sans la permission requise reçoit un refus serveur, même en appelant
 * directement l'API — jamais un simple masquage de bouton côté client (§14).
 */
describe('Permissions fines (e2e, CA14)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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

  async function loginAs(email: string, motDePasse: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, motDePasse })
      .expect(201);
    return res.body.accessToken;
  }

  it('le Secrétaire-caissier (aucune permission Lot 1) reçoit 403 sur une route ACADEMIC_STRUCTURE_MANAGE', async () => {
    const school = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      school.id,
      'SECRETAIRE_CAISSIER',
    );
    const token = await loginAs(user.email, motDePasse);

    await request(app.getHttpServer())
      .post('/sections')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'FRANCOPHONE', nom: 'Section francophone' })
      .expect(403);
  });

  it('le Secrétaire-caissier reçoit 403 sur la gestion des utilisateurs (USER_MANAGE)', async () => {
    const school = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      school.id,
      'SECRETAIRE_CAISSIER',
    );
    const token = await loginAs(user.email, motDePasse);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it("l'Administrateur (ACADEMIC_STRUCTURE_MANAGE) peut créer une section", async () => {
    const admin = await loginAs('admin@shakespeareacademy.cg', 'ChangeMe123!');

    await request(app.getHttpServer())
      .post('/sections')
      .set('Authorization', `Bearer ${admin}`)
      .send({ code: 'FRANCOPHONE', nom: 'Section francophone' })
      .expect(201);
  });

  it("l'Auditeur (AUDIT_LOG_READ) peut lire le journal d'audit mais pas créer un utilisateur", async () => {
    const school = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      school.id,
      'AUDITEUR',
    );
    const token = await loginAs(user.email, motDePasse);

    await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nom: 'X',
        prenom: 'Y',
        email: 'x@y.local',
        motDePasse: 'MotDePasse123!',
        roleId: user.roleId,
      })
      .expect(403);
  });

  it('un jeton invalide/forgé est rejeté (401), pas seulement un jeton absent', async () => {
    await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', 'Bearer ceci-nest-pas-un-jwt-valide')
      .expect(401);
  });
});

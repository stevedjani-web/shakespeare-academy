import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures } from './utils/fixtures';

describe('Utilisateurs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let secretaireRoleId: string;

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
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: 'SECRETAIRE_CAISSIER' },
    });
    secretaireRoleId = role.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${adminToken}`);
  }

  it('crée un utilisateur, jamais avec le hash du mot de passe dans la réponse', async () => {
    const res = await auth(request(app.getHttpServer()).post('/users')).send({
      nom: 'Mbemba',
      prenom: 'Alice',
      email: 'alice@shakespeareacademy.cg',
      motDePasse: 'MotDePasse123!',
      roleId: secretaireRoleId,
    });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('alice@shakespeareacademy.cg');
    expect(res.body).not.toHaveProperty('motDePasseHash');
    expect(res.body.doitChangerMotDePasse).toBe(true);
  });

  it('refuse deux utilisateurs avec le même e-mail', async () => {
    await auth(request(app.getHttpServer()).post('/users'))
      .send({
        nom: 'A',
        prenom: 'B',
        email: 'dup@test.local',
        motDePasse: 'MotDePasse123!',
        roleId: secretaireRoleId,
      })
      .expect(201);
    await auth(request(app.getHttpServer()).post('/users'))
      .send({
        nom: 'C',
        prenom: 'D',
        email: 'dup@test.local',
        motDePasse: 'MotDePasse123!',
        roleId: secretaireRoleId,
      })
      .expect(409);
  });

  it('désactive un utilisateur, qui ne peut alors plus se connecter', async () => {
    const created = await auth(
      request(app.getHttpServer()).post('/users'),
    ).send({
      nom: 'Mbemba',
      prenom: 'Alice',
      email: 'alice2@shakespeareacademy.cg',
      motDePasse: 'MotDePasse123!',
      roleId: secretaireRoleId,
    });

    await auth(request(app.getHttpServer()).patch(`/users/${created.body.id}`))
      .send({ statut: 'INACTIF' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'alice2@shakespeareacademy.cg',
        motDePasse: 'MotDePasse123!',
      })
      .expect(403);
  });

  it('réinitialise le mot de passe (récupération administrée) et force le changement à la connexion', async () => {
    const created = await auth(
      request(app.getHttpServer()).post('/users'),
    ).send({
      nom: 'Mbemba',
      prenom: 'Alice',
      email: 'alice3@shakespeareacademy.cg',
      motDePasse: 'MotDePasse123!',
      roleId: secretaireRoleId,
    });

    await auth(
      request(app.getHttpServer()).patch(
        `/users/${created.body.id}/reset-password`,
      ),
    )
      .send({ nouveauMotDePasse: 'MotDeSecours123!' })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'alice3@shakespeareacademy.cg',
        motDePasse: 'MotDeSecours123!',
      })
      .expect(201);
    expect(login.body.user.doitChangerMotDePasse).toBe(true);
  });
});

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

  describe('changement de rôle', () => {
    async function createAs(roleId: string, email: string) {
      const res = await auth(request(app.getHttpServer()).post('/users'))
        .send({
          nom: 'Test',
          prenom: 'Compte',
          email,
          motDePasse: 'MotDePasse123!',
          roleId,
        })
        .expect(201);
      return res.body as { id: string; role: { code: string } };
    }
    const loginAs = async (email: string) =>
      (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, motDePasse: 'MotDePasse123!' })
          .expect(201)
      ).body.accessToken as string;

    it('change le rôle d’un compte, journalise l’ancien et le nouveau, avec effet immédiat sur ses droits', async () => {
      const user = await createAs(secretaireRoleId, 'sec@test.local');
      const token = await loginAs('sec@test.local');
      // Secrétaire-caissier : il encaisse mais ne saisit pas de sortie (EXPENSE_CREATE : Administrateur et Comptable).
      await request(app.getHttpServer())
        .post('/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(403);

      const comptable = await prisma.role.findUniqueOrThrow({
        where: { code: 'COMPTABLE' },
      });
      const res = await auth(
        request(app.getHttpServer()).patch(`/users/${user.id}`),
      )
        .send({ roleId: comptable.id })
        .expect(200);
      expect(res.body.role.code).toBe('COMPTABLE');
      expect(res.body).not.toHaveProperty('motDePasseHash');

      // Le même jeton, sans reconnexion : les droits sont relus en base à chaque requête. Comptable saisit des sorties
      // (la requête vide est refusée pour son contenu, plus pour son droit).
      const after = await request(app.getHttpServer())
        .post('/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(after.status).toBe(400);

      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'USER_UPDATE', entiteId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      expect((log.ancienneValeur as { role: { code: string } }).role.code).toBe(
        'SECRETAIRE_CAISSIER',
      );
      expect((log.nouvelleValeur as { role: { code: string } }).role.code).toBe(
        'COMPTABLE',
      );
      expect(JSON.stringify(log)).not.toMatch(/motDePasseHash|argon2/i);
    });

    it('refuse un rôle inconnu (404) et laisse le compte inchangé', async () => {
      const user = await createAs(secretaireRoleId, 'sec2@test.local');
      await auth(request(app.getHttpServer()).patch(`/users/${user.id}`))
        .send({ roleId: 'role-inconnu' })
        .expect(404);
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { role: true },
      });
      expect(stored.role.code).toBe('SECRETAIRE_CAISSIER');
    });

    it('refuse de changer son propre rôle (403) mais permet de modifier son nom', async () => {
      const me = await prisma.user.findFirstOrThrow({
        where: { email: 'admin@shakespeareacademy.cg' },
      });
      await auth(request(app.getHttpServer()).patch(`/users/${me.id}`))
        .send({ roleId: secretaireRoleId })
        .expect(403);
      expect(
        (
          await prisma.user.findUniqueOrThrow({
            where: { id: me.id },
            include: { role: true },
          })
        ).role.code,
      ).toBe('ADMINISTRATEUR');
      // Renvoyer son rôle actuel n'est pas un changement.
      await auth(request(app.getHttpServer()).patch(`/users/${me.id}`))
        .send({ roleId: me.roleId, prenom: 'Admin' })
        .expect(200);
    });

    it('exige USER_MANAGE et ne s’applique pas sans jeton', async () => {
      const user = await createAs(secretaireRoleId, 'sec3@test.local');
      const token = await loginAs('sec3@test.local');
      await request(app.getHttpServer())
        .patch(`/users/${user.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: secretaireRoleId })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/users/${user.id}`)
        .send({ roleId: secretaireRoleId })
        .expect(401);
    });
  });
});

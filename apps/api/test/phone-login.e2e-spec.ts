import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures } from './utils/fixtures';

jest.setTimeout(30000);

/** Connexion du personnel par e-mail ou par numéro de téléphone (un enseignant peut ne pas avoir d'e-mail). */
describe('Connexion par téléphone (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let roleId: string;
  const PASSWORD = 'MotDePasse123!';

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
    roleId = (
      await prisma.role.findUniqueOrThrow({ where: { code: 'ENSEIGNANT' } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const admin = (req: request.Test) =>
    req.set('Authorization', `Bearer ${adminToken}`);
  const post = (path: string, body: object) =>
    admin(request(app.getHttpServer()).post(path)).send(body);
  const patch = (path: string, body: object) =>
    admin(request(app.getHttpServer()).patch(path)).send(body);
  const login = (identifiant: string, motDePasse = PASSWORD) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifiant, motDePasse });

  const teacher = (extra: object = {}) =>
    post('/users', {
      nom: 'Kimpolo',
      prenom: 'Régina',
      telephone: '+242 06 000 0001',
      motDePasse: PASSWORD,
      roleId,
      ...extra,
    });

  it('crée un compte avec le seul numéro de téléphone, sans e-mail', async () => {
    const res = await teacher().expect(201);
    expect(res.body.email).toBeNull();
    expect(res.body.telephone).toBe('+242 06 000 0001');
    expect(res.body.doitChangerMotDePasse).toBe(true);
    expect(res.body).not.toHaveProperty('motDePasseHash');
    expect(res.body).not.toHaveProperty('telephoneCle');
  });

  it('se connecte avec le numéro écrit de plusieurs façons', async () => {
    await teacher().expect(201);
    for (const written of [
      '+242 06 000 0001',
      '242060000001',
      '06 000 0001',
      '060000001',
      '00242-06-000-0001',
      ' (242) 060 000 001 ',
    ]) {
      const res = await login(written).expect(201);
      expect(res.body.user.telephone).toBe('+242 06 000 0001');
      expect(res.body.user.email).toBeNull();
    }
  });

  it('l’ancien champ « email » de la page de connexion accepte aussi un numéro', async () => {
    await teacher().expect(201);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: '060000001', motDePasse: PASSWORD })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ motDePasse: PASSWORD })
      .expect(400);
  });

  it('un compte avec les deux identifiants se connecte avec l’un ou l’autre', async () => {
    await teacher({ email: 'regina@exemple.test' }).expect(201);
    await login('regina@exemple.test').expect(201);
    await login('060000001').expect(201);
  });

  it('le numéro d’un compte ne fonctionne pas sur un autre, et un numéro inconnu donne le même refus', async () => {
    await teacher().expect(201);
    await teacher({
      nom: 'Mbede',
      prenom: 'Mireille',
      telephone: '06 000 0002',
    }).expect(201);
    const other = await login('060000002').expect(201);
    expect(other.body.user.nom).toBe('Mbede');

    const wrong = await login('060000001', 'mauvais').expect(401);
    const unknown = await login('060000099').expect(401);
    expect(unknown.body.message).toBe(wrong.body.message);
    // Un numéro trop court n'est jamais cherché : même refus.
    const short = await login('12345').expect(401);
    expect(short.body.message).toBe(wrong.body.message);
  });

  it('verrouille le compte après cinq échecs, comme avec un e-mail', async () => {
    await teacher().expect(201);
    for (let i = 0; i < 5; i++) await login('060000001', 'mauvais').expect(401);
    await login('060000001').expect(403);
    await login('+242 06 000 0001').expect(403);
  });

  it('refuse un compte désactivé', async () => {
    const created = await teacher().expect(201);
    await patch(`/users/${created.body.id}`, { statut: 'INACTIF' }).expect(200);
    const res = await login('060000001').expect(403);
    expect(res.body.message).toContain('désactivé');
  });

  it('refuse un compte sans aucun identifiant, un numéro trop court et un doublon', async () => {
    await post('/users', {
      nom: 'Sans',
      prenom: 'Identifiant',
      motDePasse: PASSWORD,
      roleId,
    }).expect(400);
    await teacher({ telephone: '12345' }).expect(400);
    await teacher({ telephone: 'abc' }).expect(400);

    await teacher().expect(201);
    // Même ligne écrite autrement : refusée.
    await teacher({ nom: 'Autre', telephone: '060000001' }).expect(409);
    await teacher({ nom: 'Autre', telephone: '00242 06 000 0001' }).expect(409);
    // E-mail déjà pris : toujours refusé.
    await teacher({
      nom: 'Autre',
      telephone: '06 000 0003',
      email: 'admin@shakespeareacademy.cg',
    }).expect(409);
    expect(await prisma.user.count({ where: { nom: 'Autre' } })).toBe(0);
  });

  it('ajoute, change et retire un numéro ; un compte garde toujours un identifiant', async () => {
    const created = await post('/users', {
      nom: 'Mbede',
      prenom: 'Mireille',
      email: 'mireille@exemple.test',
      motDePasse: PASSWORD,
      roleId,
    }).expect(201);
    const id = created.body.id;
    await login('060000005').expect(401);

    await patch(`/users/${id}`, { telephone: '06 000 0005' }).expect(200);
    await login('060000005').expect(201);

    // Changement : l'ancien numéro ne marche plus.
    await patch(`/users/${id}`, { telephone: '06 000 0006' }).expect(200);
    await login('060000005').expect(401);
    await login('060000006').expect(201);

    // Retirer le numéro alors qu'il reste l'e-mail : permis.
    await patch(`/users/${id}`, { telephone: null }).expect(200);
    await login('060000006').expect(401);
    await login('mireille@exemple.test').expect(201);

    // Retirer le dernier identifiant : refusé.
    await patch(`/users/${id}`, { email: null }).expect(400);
    await patch(`/users/${id}`, { telephone: '06 000 0006' }).expect(200);
    await patch(`/users/${id}`, { email: null }).expect(200);
    await patch(`/users/${id}`, { telephone: null }).expect(400);

    // Un numéro déjà pris par un autre compte : refusé.
    await teacher({ nom: 'Autre', telephone: '06 000 0007' }).expect(201);
    await patch(`/users/${id}`, { telephone: '+242 06 000 0007' }).expect(409);
    await patch(`/users/${id}`, { telephone: '123' }).expect(400);
    // Garder son propre numéro n'est pas un conflit.
    await patch(`/users/${id}`, { telephone: '06 000 0006' }).expect(200);
  });

  it('un compte sans e-mail apparaît avec son numéro dans « me », la liste et les comptes à relier', async () => {
    const created = await teacher().expect(201);
    const token = (await login('060000001').expect(201)).body.accessToken;
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.email).toBeNull();
    expect(me.body.telephone).toBe('+242 06 000 0001');

    const list = await admin(request(app.getHttpServer()).get('/users')).expect(
      200,
    );
    const row = list.body.find((u: { id: string }) => u.id === created.body.id);
    expect(row.telephone).toBe('+242 06 000 0001');
    expect(row.email).toBeNull();

    const linkable = await admin(
      request(app.getHttpServer()).get('/teachers/linkable-users'),
    ).expect(200);
    const link = linkable.body.find(
      (u: { id: string }) => u.id === created.body.id,
    );
    expect(link.telephone).toBe('+242 06 000 0001');
  });

  it('le journal garde la création et le changement, jamais un mot de passe', async () => {
    const created = await teacher().expect(201);
    await patch(`/users/${created.body.id}`, {
      telephone: '06 000 0009',
    }).expect(200);
    const logs = await prisma.auditLog.findMany({
      where: { entiteId: created.body.id },
    });
    expect(logs.map((l) => l.action).sort()).toEqual([
      'USER_CREATE',
      'USER_UPDATE',
    ]);
    expect(JSON.stringify(logs)).not.toContain('motDePasse');
    expect(JSON.stringify(logs)).not.toContain(PASSWORD);
  });

  it('seul un compte autorisé crée ou modifie un compte', async () => {
    const created = await teacher().expect(201);
    const token = (await login('060000001').expect(201)).body.accessToken;
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nom: 'X',
        prenom: 'Y',
        telephone: '06 000 0010',
        motDePasse: PASSWORD,
        roleId,
      })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ telephone: '06 000 0010' })
      .expect(403);
  });
});

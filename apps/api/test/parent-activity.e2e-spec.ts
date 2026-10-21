import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays } from '../src/timetable/timetable.util';

/**
 * Activité des parents : qui s'est connecté à son espace, quand, combien de fois, et qui ne l'a jamais fait.
 * Tout est lu dans les comptes et le journal d'audit, rien n'est écrit.
 */
describe('Activité des parents (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const DAY = 24 * 60 * 60 * 1000;
  const PASSWORD = 'MotDePasse123';
  const PHONE = {
    moukala: '242060000001',
    zola: '242060000002',
    nzila: '242060000003',
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    admin = await staffToken('admin@shakespeareacademy.cg', 'ChangeMe123!');
  });

  afterAll(async () => {
    await app.close();
  });

  async function staffToken(email: string, motDePasse: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, motDePasse })
      .expect(201);
    return res.body.accessToken as string;
  }

  const get = (path: string, token?: string) => {
    const r = request(app.getHttpServer()).get(path);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  const post = (path: string, token: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const parentLogin = (telephone: string) =>
    request(app.getHttpServer())
      .post('/portal/login')
      .send({ telephone, motDePasse: PASSWORD });

  /**
   * Trois familles dans la classe « CM2 A » : Moukala (deux enfants, compte actif qui se connecte), Zola (compte actif
   * jamais utilisé) et Nzila (compte désactivé).
   */
  async function families() {
    const section = (
      await post('/sections', admin, { code: 'FR', nom: 'Francophone' })
    ).body;
    const cycle = (
      await post('/cycles', admin, {
        sectionId: section.id,
        code: 'PRIM',
        nom: 'Primaire',
      })
    ).body;
    const level = (
      await post('/levels', admin, {
        cycleId: cycle.id,
        code: 'CM2',
        nom: 'CM2',
      })
    ).body;
    const year = (
      await post('/academic-years', admin, {
        libelle: '2026-2027',
        dateDebut: addDays(today, -120),
        dateFin: addDays(today, 200),
      })
    ).body;
    await post(`/academic-years/${year.id}/activate`, admin).expect(201);
    const klass = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 A',
      })
    ).body;
    const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const out: Record<string, { guardianId: string; accountId: string }> = {};
    const mk = async (
      key: string,
      nom: string,
      prenoms: string[],
      tel: string,
      statut: 'ACTIF' | 'INACTIF' = 'ACTIF',
    ) => {
      let guardianId = '';
      for (const prenom of prenoms) {
        const student = (
          await post('/students', admin, {
            nom,
            prenom,
            sexe: 'F',
            dateNaissance: '2015-04-12',
            responsable: {
              nom,
              prenom: 'Parent',
              telephone: tel,
              lien: 'Parent',
            },
          }).expect(201)
        ).body;
        await post('/enrollments', admin, {
          studentId: student.id,
          classId: klass.id,
          academicYearId: year.id,
        }).expect(201);
        guardianId = (
          await prisma.studentGuardian.findFirstOrThrow({
            where: { studentId: student.id },
          })
        ).guardianId;
      }
      const account = await prisma.parentAccount.create({
        data: { guardianId, motDePasseHash: hash, statut },
      });
      out[key] = { guardianId, accountId: account.id };
    };
    await mk('moukala', 'Moukala', ['Alice', 'Brice'], PHONE.moukala);
    await mk('zola', 'Zola', ['Carine'], PHONE.zola);
    await mk('nzila', 'Nzila', ['Diane'], PHONE.nzila, 'INACTIF');
    return out;
  }

  it('compte les connexions, les comptes jamais utilisés et classe les plus récents en premier', async () => {
    const f = await families();
    await parentLogin(PHONE.moukala).expect(201);
    await parentLogin(PHONE.moukala).expect(201);

    const res = await get('/parent-activity', admin).expect(200);
    expect(res.body.jours).toBe(30);
    expect(res.body.resume).toEqual({
      comptes: 3,
      actifs: 2,
      jamaisConnectes: 1,
      connectes24h: 1,
      connectes7j: 1,
      connectes30j: 1,
      connectesPeriode: 1,
      inactifsPeriode: 0,
      connexionsPeriode: 2,
    });
    const rows = res.body.parents as Array<{
      accountId: string;
      nom: string;
      statut: string;
      connexions: number;
      dernierLoginAt: string | null;
      enfants: Array<{ prenom: string; classe: string | null }>;
    }>;
    // Le seul compte qui s'est connecté passe devant ceux qui ne l'ont jamais fait.
    expect(rows[0].accountId).toBe(f.moukala.accountId);
    expect(rows[0].connexions).toBe(2);
    expect(rows[0].dernierLoginAt).not.toBeNull();
    expect(rows[0].enfants.map((e) => e.prenom).sort()).toEqual([
      'Alice',
      'Brice',
    ]);
    expect(rows[0].enfants.every((e) => e.classe === 'CM2 A')).toBe(true);
    const zola = rows.find((r) => r.accountId === f.zola.accountId)!;
    expect(zola.connexions).toBe(0);
    expect(zola.dernierLoginAt).toBeNull();
    // Un compte désactivé n'est jamais compté parmi les familles à relancer.
    const nzila = rows.find((r) => r.accountId === f.nzila.accountId)!;
    expect(nzila.statut).toBe('INACTIF');
  });

  it("l'historique liste chaque connexion, la plus récente d'abord, avec le parent et ses enfants", async () => {
    const f = await families();
    await parentLogin(PHONE.zola).expect(201);
    await parentLogin(PHONE.moukala).expect(201);

    const res = await get('/parent-activity/logins', admin).expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.affiches).toBe(2);
    const events = res.body.evenements as Array<{
      le: string;
      accountId: string;
      nom: string;
      telephone: string;
      enfants: Array<{ prenom: string }>;
    }>;
    expect(events.map((e) => e.accountId)).toEqual([
      f.moukala.accountId,
      f.zola.accountId,
    ]);
    expect(new Date(events[0].le).getTime()).toBeGreaterThanOrEqual(
      new Date(events[1].le).getTime(),
    );
    expect(events[0].nom).toBe('Moukala');
    expect(events[0].telephone).toBe(PHONE.moukala);
    expect(events[0].enfants).toHaveLength(2);
  });

  it('une connexion refusée (mauvais mot de passe) ne figure jamais dans l’historique', async () => {
    const f = await families();
    // Une autre action d'un parent (changement de mot de passe) n'est pas une connexion.
    await prisma.auditLog.create({
      data: {
        schoolId: (await prisma.school.findFirstOrThrow()).id,
        userId: null,
        action: 'PARENT_PASSWORD_CHANGE',
        entite: 'ParentAccount',
        entiteId: f.moukala.accountId,
      },
    });
    await request(app.getHttpServer())
      .post('/portal/login')
      .send({ telephone: PHONE.moukala, motDePasse: 'mauvais-mot-de-passe' })
      .expect(401);
    const res = await get('/parent-activity/logins', admin).expect(200);
    expect(res.body.total).toBe(0);
    const overview = await get('/parent-activity', admin).expect(200);
    expect(overview.body.resume.jamaisConnectes).toBe(2);
  });

  it('la période limite les connexions comptées, et distingue ceux qui ne sont pas revenus', async () => {
    const f = await families();
    await parentLogin(PHONE.moukala).expect(201);
    await parentLogin(PHONE.moukala).expect(201);
    // Les deux connexions datent de 40 jours.
    await prisma.auditLog.updateMany({
      where: { action: 'PARENT_LOGIN_SUCCESS' },
      data: { createdAt: new Date(Date.now() - 40 * DAY) },
    });
    await prisma.parentAccount.update({
      where: { id: f.moukala.accountId },
      data: { dernierLoginAt: new Date(Date.now() - 40 * DAY) },
    });

    const short = await get('/parent-activity?jours=30', admin).expect(200);
    expect(short.body.resume.connexionsPeriode).toBe(0);
    expect(short.body.resume.inactifsPeriode).toBe(1);
    expect(short.body.resume.connectes30j).toBe(0);
    expect(short.body.resume.jamaisConnectes).toBe(1);
    expect(
      (await get('/parent-activity/logins?jours=30', admin)).body.total,
    ).toBe(0);

    const long = await get('/parent-activity?jours=60', admin).expect(200);
    expect(long.body.resume.connexionsPeriode).toBe(2);
    expect(long.body.resume.inactifsPeriode).toBe(0);
    expect(
      (await get('/parent-activity/logins?jours=60', admin)).body.total,
    ).toBe(2);
  });

  it("limite le nombre de lignes de l'historique sans cacher le total", async () => {
    await families();
    await parentLogin(PHONE.moukala).expect(201);
    await parentLogin(PHONE.moukala).expect(201);
    await parentLogin(PHONE.zola).expect(201);
    const res = await get('/parent-activity/logins?limite=2', admin).expect(
      200,
    );
    expect(res.body.total).toBe(3);
    expect(res.body.affiches).toBe(2);
    expect(res.body.evenements).toHaveLength(2);
  });

  it('refuse une période ou une limite hors bornes (400)', async () => {
    await get('/parent-activity?jours=0', admin).expect(400);
    await get('/parent-activity?jours=9999', admin).expect(400);
    await get('/parent-activity/logins?limite=100000', admin).expect(400);
    await get('/parent-activity?jours=abc', admin).expect(400);
  });

  it("n'expose ni empreinte de mot de passe, ni jeton, ni code", async () => {
    await families();
    await parentLogin(PHONE.moukala).expect(201);
    const a = JSON.stringify((await get('/parent-activity', admin)).body);
    const b = JSON.stringify(
      (await get('/parent-activity/logins', admin)).body,
    );
    for (const text of [a, b]) {
      expect(text).not.toMatch(/motDePasse|argon2|tokenHash|refreshToken/i);
    }
    const row = (await get('/parent-activity', admin)).body.parents[0];
    expect(Object.keys(row).sort()).toEqual(
      [
        'accountId',
        'activeLe',
        'connexions',
        'dernierLoginAt',
        'enfants',
        'nom',
        'prenom',
        'statut',
        'telephone',
      ].sort(),
    );
  });

  it('droits : secrétariat et Direction oui, comptable, sans jeton ou avec un jeton de parent non', async () => {
    await families();
    const sch = await prisma.school.findFirstOrThrow();
    const give = async (role: string, email: string) => {
      const { user, motDePasse } = await createUserWithRole(
        prisma,
        sch.id,
        role,
        { email },
      );
      return staffToken(user.email, motDePasse);
    };
    const secretary = await give('SECRETAIRE_CAISSIER', 'sec@test.local');
    const direction = await give('DIRECTION', 'dir@test.local');
    const accountant = await give('COMPTABLE', 'compta@test.local');
    await get('/parent-activity', secretary).expect(200);
    await get('/parent-activity/logins', direction).expect(200);
    await get('/parent-activity', accountant).expect(403);
    await get('/parent-activity/logins', accountant).expect(403);
    await get('/parent-activity').expect(401);

    const parent = await parentLogin(PHONE.moukala).expect(201);
    await get('/parent-activity', parent.body.accessToken).expect(401);
    await get('/parent-activity/logins', parent.body.accessToken).expect(401);
  });

  it("consulter l'activité n'écrit rien (ni donnée, ni journal)", async () => {
    await families();
    await parentLogin(PHONE.moukala).expect(201);
    const before = await prisma.auditLog.count();
    await get('/parent-activity', admin).expect(200);
    await get('/parent-activity/logins', admin).expect(200);
    expect(await prisma.auditLog.count()).toBe(before);
  });
});

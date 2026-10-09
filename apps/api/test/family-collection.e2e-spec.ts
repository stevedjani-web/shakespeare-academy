import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays } from '../src/timetable/timetable.util';
import { CONSENT_VERSION } from '../src/parent-portal/parent-auth.util';

/**
 * Collecte des informations des familles par lien de classe (D184 à D190). Un lien par classe, posté dans le groupe
 * WhatsApp des parents : chaque parent saisit ses informations, celles de ses enfants et un mot de passe. Rien n'atteint
 * les dossiers avant la validation du secrétariat, qui crée alors le responsable, le rattache et active son compte.
 */
describe('Collecte des informations des familles (e2e)', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  beforeAll(async () => {
    process.env.COLLECTE_LIMITE_PAR_HEURE = '1000';
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    process.env.COLLECTE_LIMITE_PAR_HEURE = '1000';
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    admin = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
  });

  afterAll(async () => {
    delete process.env.COLLECTE_LIMITE_PAR_HEURE;
    await app.close();
  });

  async function login(email: string, motDePasse: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, motDePasse })
      .expect(201);
    return res.body.accessToken;
  }
  const get = (path: string, t = admin) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const post = (path: string, t = admin, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const patch = (path: string, t = admin, body: object = {}) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const publicGet = (token: string) =>
    request(app.getHttpServer()).get(`/family-collection/public/${token}`);
  const publicPost = (token: string, body: object) =>
    request(app.getHttpServer())
      .post(`/family-collection/public/${token}`)
      .send(body);
  const portalLogin = (telephone: string, motDePasse: string) =>
    request(app.getHttpServer())
      .post('/portal/login')
      .send({ telephone, motDePasse });

  interface Env {
    year: { id: string };
    classA: { id: string };
    classB: { id: string };
    level: { id: string };
  }
  let env: Env;

  async function setupSchool(): Promise<Env> {
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
    const classA = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 A',
      })
    ).body;
    const classB = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 B',
      })
    ).body;
    return { year, classA, classB, level };
  }

  /** Élève inscrit dans la classe, créé comme le fait la secrétaire pressée : ni date de naissance ni responsable. */
  async function student(
    nom: string,
    prenom: string,
    classId: string,
    extra: object = {},
  ): Promise<{ id: string }> {
    const created = (
      await post('/students', admin, {
        nom,
        prenom,
        sexe: 'F',
        ...extra,
      }).expect(201)
    ).body;
    await post('/enrollments', admin, {
      studentId: created.id,
      classId,
      academicYearId: env.year.id,
    }).expect(201);
    return created;
  }

  async function link(classId: string): Promise<string> {
    const res = await post(`/family-collection/classes/${classId}/link`).expect(
      201,
    );
    return res.body.token;
  }

  const PHONE = '242060000001';
  const payload = (over: Record<string, unknown> = {}) => ({
    responsable: {
      nom: 'Moukala',
      prenom: 'Josiane',
      telephone: PHONE,
      email: 'josiane@example.com',
      profession: 'Infirmière',
      adresse: 'Poto-Poto',
      lien: 'Mère',
    },
    motDePasse: 'MotDePasse123',
    consentement: true,
    versionPolitique: CONSENT_VERSION,
    enfants: [
      {
        nom: 'Moukala',
        prenom: 'Alice',
        dateNaissance: '2015-04-12',
        lieuNaissance: 'Brazzaville',
      },
    ],
    ...over,
  });

  interface ChildView {
    id: string;
    statut: string;
    analyse: {
      match: string;
      simple: boolean;
      alertes: Array<{ code: string; severite: string }>;
      modifications: Array<{ champ: string; type: string }>;
      etudiantPropose: { id: string } | null;
    } | null;
  }
  interface SubView {
    id: string;
    enfants: ChildView[];
  }
  async function pending(): Promise<SubView[]> {
    return (await get('/family-collection/submissions').expect(200)).body;
  }

  beforeEach(async () => {
    env = await setupSchool();
  });

  // ------------------------------------------------------------------ Liens de classe

  describe('liens de classe', () => {
    it('crée le lien d’une classe, le renvoie tel quel au second appel et le remplace sur demande', async () => {
      const first = await post(
        `/family-collection/classes/${env.classA.id}/link`,
      ).expect(201);
      expect(first.body.token).toHaveLength(32);
      expect(first.body.actif).toBe(true);
      const again = await post(
        `/family-collection/classes/${env.classA.id}/link`,
      ).expect(201);
      expect(again.body.token).toBe(first.body.token);

      const renewed = await post(
        `/family-collection/classes/${env.classA.id}/link`,
        admin,
        { regenerer: true },
      ).expect(201);
      expect(renewed.body.token).not.toBe(first.body.token);
      // L'ancien lien cesse de fonctionner.
      await publicGet(first.body.token).expect(404);
      await publicGet(renewed.body.token).expect(200);
    });

    it('crée en une fois les liens de toutes les classes qui n’en ont pas', async () => {
      await link(env.classA.id);
      const res = await post('/family-collection/links/generate-all').expect(
        201,
      );
      expect(res.body.crees).toBe(1);
      const classes = (await get('/family-collection/classes').expect(200))
        .body;
      expect(classes.every((c: { lien: unknown }) => c.lien)).toBe(true);
    });

    it('ferme, rouvre et prolonge un lien ; un lien fermé ou échu répond 410', async () => {
      const token = await link(env.classA.id);
      await publicGet(token).expect(200);

      await patch(`/family-collection/classes/${env.classA.id}/link`, admin, {
        actif: false,
      }).expect(200);
      const closed = await publicGet(token).expect(410);
      expect(closed.body.message).toMatch(/n’est plus actif/);
      await publicPost(token, payload()).expect(410);

      await patch(`/family-collection/classes/${env.classA.id}/link`, admin, {
        actif: true,
      }).expect(200);
      await publicGet(token).expect(200);

      await prisma.classCollectLink.update({
        where: { classId: env.classA.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await publicGet(token).expect(410);
      const extended = await patch(
        `/family-collection/classes/${env.classA.id}/link`,
        admin,
        { prolonger: true },
      ).expect(200);
      expect(extended.body.expire).toBe(false);
      await publicGet(token).expect(200);
    });

    it('refuse un lien pour une classe qui n’est pas de l’année active', async () => {
      const draft = (
        await post('/academic-years', admin, {
          libelle: '2027-2028',
          dateDebut: addDays(today, 201),
          dateFin: addDays(today, 500),
        })
      ).body;
      const classC = (
        await post('/classes', admin, {
          levelId: env.level.id,
          academicYearId: draft.id,
          nom: 'CM2 C',
        })
      ).body;
      await post(`/family-collection/classes/${classC.id}/link`).expect(404);
    });

    it('un jeton inconnu répond 404', async () => {
      await publicGet('inconnu').expect(404);
    });

    it('ne s’ouvre qu’avec le droit d’inscription', async () => {
      const sch = await prisma.school.findFirstOrThrow();
      const { user, motDePasse } = await createUserWithRole(
        prisma,
        sch.id,
        'COMPTABLE',
        { email: 'compta@test.local' },
      );
      const t = await login(user.email, motDePasse);
      const paths = [
        '/family-collection/classes',
        `/family-collection/classes/${env.classA.id}`,
        '/family-collection/submissions',
      ];
      for (const p of paths) await get(p, t).expect(403);
      await post(`/family-collection/classes/${env.classA.id}/link`, t).expect(
        403,
      );
      await patch(`/family-collection/classes/${env.classA.id}/link`, t, {
        actif: false,
      }).expect(403);
      await post('/family-collection/links/generate-all', t).expect(403);
      await post(
        `/family-collection/classes/${env.classA.id}/valider-simples`,
        t,
      ).expect(403);
      await request(app.getHttpServer())
        .get('/family-collection/classes')
        .expect(401);
    });
  });

  // ------------------------------------------------------------- Page publique

  describe('page publique', () => {
    it('donne la classe du lien et les classes, jamais le nom d’un élève', async () => {
      await student('Moukala', 'Alice', env.classA.id);
      const token = await link(env.classA.id);
      const res = await publicGet(token).expect(200);
      expect(res.body.classe.nom).toBe('CM2 A');
      expect(res.body.classes.map((c: { nom: string }) => c.nom)).toEqual([
        'CM2 A',
        'CM2 B',
      ]);
      expect(res.body.versionPolitique).toBe(CONSENT_VERSION);
      expect(JSON.stringify(res.body)).not.toMatch(/Alice|Moukala/);
    });
  });

  // ---------------------------------------------------------------- Dépôt

  describe('dépôt d’un parent', () => {
    let token: string;
    beforeEach(async () => {
      await student('Moukala', 'Alice', env.classA.id);
      token = await link(env.classA.id);
    });

    it('refuse sans consentement, avec une autre version de la politique ou un mot de passe court', async () => {
      await publicPost(token, payload({ consentement: false })).expect(400);
      await publicPost(token, payload({ versionPolitique: 'ancienne' })).expect(
        400,
      );
      await publicPost(token, payload({ motDePasse: 'court' })).expect(400);
    });

    it('refuse une date de naissance impossible, future ou une classe inconnue', async () => {
      const child = (over: object) => ({
        enfants: [
          {
            nom: 'Moukala',
            prenom: 'Alice',
            dateNaissance: '2015-04-12',
            ...over,
          },
        ],
      });
      await publicPost(
        token,
        payload(child({ dateNaissance: '2015-02-31' })),
      ).expect(400);
      await publicPost(
        token,
        payload(child({ dateNaissance: addDays(today, 3) })),
      ).expect(400);
      await publicPost(
        token,
        payload(child({ dateNaissance: '1950-01-01' })),
      ).expect(400);
      await publicPost(token, payload(child({ classId: 'inconnue' }))).expect(
        400,
      );
    });

    it('refuse un enfant écrit deux fois dans le même envoi', async () => {
      const res = await publicPost(
        token,
        payload({
          enfants: [
            { nom: 'Moukala', prenom: 'Alice', dateNaissance: '2015-04-12' },
            { nom: 'MOUKALA', prenom: 'alice', dateNaissance: '2015-04-12' },
          ],
        }),
      ).expect(400);
      expect(JSON.stringify(res.body)).toMatch(/deux fois/);
    });

    it('refuse un champ inattendu (aucun contournement du modèle)', async () => {
      await publicPost(token, { ...payload(), statut: 'VALIDE' }).expect(400);
    });

    it('enregistre la demande SANS toucher aux dossiers, au responsable ni aux comptes', async () => {
      const before = {
        students: await prisma.student.count(),
        guardians: await prisma.guardian.count(),
        accounts: await prisma.parentAccount.count(),
      };
      const res = await publicPost(token, payload()).expect(201);
      expect(res.body.recu).toBe(true);
      expect(res.body.enfants).toEqual([
        {
          prenom: 'Alice',
          nom: 'Moukala',
          classe: 'CM2 A',
          ordre: 0,
          photo: false,
        },
      ]);
      expect(await prisma.student.count()).toBe(before.students);
      expect(await prisma.guardian.count()).toBe(before.guardians);
      expect(await prisma.parentAccount.count()).toBe(before.accounts);
      const alice = await prisma.student.findFirstOrThrow({
        where: { prenom: 'Alice' },
      });
      expect(alice.dateNaissance).toBeNull();
      expect(await prisma.familySubmission.count()).toBe(1);
    });

    it('ne conserve jamais le mot de passe en clair et ne le met pas dans le journal', async () => {
      await publicPost(token, payload()).expect(201);
      const sub = await prisma.familySubmission.findFirstOrThrow();
      expect(sub.motDePasseHash).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(sub)).not.toContain('MotDePasse123');
      const logs = await prisma.auditLog.findMany({
        where: { action: 'FAMILY_COLLECTION_SUBMIT' },
      });
      expect(logs).toHaveLength(1);
      const text = JSON.stringify(logs);
      for (const secret of [
        'MotDePasse123',
        PHONE,
        'Josiane',
        'Alice',
        'josiane@example.com',
        'argon2',
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it('refuse une seconde demande en attente pour le même enfant et le même numéro', async () => {
      await publicPost(token, payload()).expect(201);
      const res = await publicPost(
        token,
        payload({
          responsable: {
            nom: 'Moukala',
            prenom: 'Josiane',
            telephone: '+242 06 000 0001',
          },
        }),
      ).expect(409);
      expect(res.body.message).toMatch(/déjà en attente/);
    });

    it('répond en anglais selon Accept-Language', async () => {
      const res = await request(app.getHttpServer())
        .post(`/family-collection/public/${token}`)
        .set('Accept-Language', 'en')
        .send(payload({ consentement: false }))
        .expect(400);
      expect(res.body.message).toMatch(/privacy policy/);
    });

    it('limite les envois par adresse (429)', async () => {
      process.env.COLLECTE_LIMITE_PAR_HEURE = '2';
      const send = () =>
        request(app.getHttpServer())
          .post(`/family-collection/public/${token}`)
          .set('X-Forwarded-For', '10.9.9.9')
          .send(payload({ consentement: false }));
      await send().expect(400);
      await send().expect(400);
      await send().expect(429);
      process.env.COLLECTE_LIMITE_PAR_HEURE = '1000';
    });
  });

  // ------------------------------------------------------------ Rapprochement

  describe('rapprochement avec les élèves de la classe', () => {
    let token: string;
    beforeEach(async () => {
      token = await link(env.classA.id);
    });

    it('reconnaît un nom saisi sans accents, en majuscules ou avec nom et prénom inversés', async () => {
      const eloise = await student('Ndong-Mba', 'Éloïse', env.classA.id);
      await publicPost(
        token,
        payload({
          enfants: [
            { nom: 'ELOISE', prenom: 'ndong mba', dateNaissance: '2015-04-12' },
          ],
        }),
      ).expect(201);
      const [sub] = await pending();
      const a = sub.enfants[0].analyse!;
      expect(a.match).toBe('EXACT');
      expect(a.etudiantPropose!.id).toBe(eloise.id);
      expect(a.simple).toBe(true);
    });

    it('ne rapproche qu’avec deux mots en commun : un seul prénom identique ne suffit pas', async () => {
      await student('Moukala', 'Alice', env.classA.id);
      await publicPost(
        token,
        payload({
          enfants: [
            { nom: 'Zola', prenom: 'Alice', dateNaissance: '2015-04-12' },
          ],
        }),
      ).expect(201);
      const a = (await pending())[0].enfants[0].analyse!;
      expect(a.match).toBe('AUCUN');
      expect(a.simple).toBe(false);
    });

    it('propose un rapprochement probable quand un second prénom manque', async () => {
      await student('Moukala', 'Alice Marie', env.classA.id);
      await publicPost(token, payload()).expect(201);
      const a = (await pending())[0].enfants[0].analyse!;
      expect(a.match).toBe('PROBABLE');
      expect(a.simple).toBe(false);
    });

    it('signale deux élèves possibles sans en choisir un', async () => {
      await student('Moukala', 'Alice', env.classA.id);
      await student('Moukala', 'Alice', env.classA.id);
      await publicPost(token, payload()).expect(201);
      const a = (await pending())[0].enfants[0].analyse!;
      expect(a.match).toBe('PLUSIEURS');
      expect(a.etudiantPropose).toBeNull();
      const child = (await pending())[0].enfants[0];
      const res = await post(
        `/family-collection/children/${child.id}/valider`,
      ).expect(422);
      expect(res.body.message).toMatch(/choisissez l’élève/);
    });

    it('ne rapproche jamais un homonyme d’une autre classe', async () => {
      const inA = await student('Moukala', 'Alice', env.classA.id);
      await student('Moukala', 'Alice', env.classB.id);
      await publicPost(token, payload()).expect(201);
      const a = (await pending())[0].enfants[0].analyse!;
      expect(a.match).toBe('EXACT');
      expect(a.etudiantPropose!.id).toBe(inA.id);
    });

    it('cherche dans la classe déclarée pour l’enfant, pas dans celle du lien', async () => {
      const brice = await student('Moukala', 'Brice', env.classB.id);
      await publicPost(
        token,
        payload({
          enfants: [
            {
              nom: 'Moukala',
              prenom: 'Brice',
              dateNaissance: '2012-01-02',
              classId: env.classB.id,
            },
          ],
        }),
      ).expect(201);
      const child = (await pending())[0].enfants[0];
      expect(child.analyse!.etudiantPropose!.id).toBe(brice.id);
    });
  });

  // ------------------------------------------------------------- Validation

  describe('validation par le secrétariat', () => {
    let token: string;
    let alice: { id: string };
    beforeEach(async () => {
      alice = await student('Moukala', 'Alice', env.classA.id);
      token = await link(env.classA.id);
    });

    it('complète l’élève, crée le responsable, le rattache et active son compte avec le mot de passe choisi', async () => {
      await publicPost(token, payload()).expect(201);
      const [sub] = await pending();
      const child = sub.enfants[0];
      expect(child.analyse!.modifications.map((m) => m.champ)).toEqual(
        expect.arrayContaining([
          'dateNaissance',
          'lieuNaissance',
          'nouveau responsable',
          'compte parent',
        ]),
      );

      const res = await post(
        `/family-collection/children/${child.id}/valider`,
      ).expect(201);
      expect(res.body.enfants[0].statut).toBe('VALIDE');

      const updated = await prisma.student.findUniqueOrThrow({
        where: { id: alice.id },
        include: {
          studentGuardians: {
            include: { guardian: { include: { parentAccount: true } } },
          },
        },
      });
      expect(updated.dateNaissance!.toISOString().slice(0, 10)).toBe(
        '2015-04-12',
      );
      expect(updated.lieuNaissance).toBe('Brazzaville');
      expect(updated.studentGuardians).toHaveLength(1);
      const [sg] = updated.studentGuardians;
      expect(sg.prioritaire).toBe(true);
      expect(sg.lien).toBe('Mère');
      expect(sg.guardian).toMatchObject({
        nom: 'Moukala',
        prenom: 'Josiane',
        telephone: PHONE,
        email: 'josiane@example.com',
        profession: 'Infirmière',
        adresse: 'Poto-Poto',
      });
      expect(sg.guardian.parentAccount!.statut).toBe('ACTIF');
      const consents = await prisma.parentConsent.findMany();
      expect(consents).toHaveLength(1);
      expect(consents[0].version).toBe(CONSENT_VERSION);

      // Le mot de passe choisi n'est plus conservé dans la demande, et le parent peut se connecter.
      const stored = await prisma.familySubmission.findFirstOrThrow();
      expect(stored.motDePasseHash).toBeNull();
      const session = await portalLogin(PHONE, 'MotDePasse123').expect(201);
      expect(session.body.accessToken).toBeTruthy();
    });

    it('le parent peut se connecter avec son numéro écrit autrement', async () => {
      await publicPost(token, payload()).expect(201);
      const child = (await pending())[0].enfants[0];
      await post(`/family-collection/children/${child.id}/valider`).expect(201);
      await portalLogin('+242 06 000 0001', 'MotDePasse123').expect(201);
    });

    it('avant la validation, le bon mot de passe annonce que l’école vérifie ; le reste reste muet', async () => {
      await publicPost(token, payload()).expect(201);
      const ok = await portalLogin(PHONE, 'MotDePasse123').expect(403);
      expect(ok.body.message).toMatch(/en cours de vérification/);
      // Mauvais mot de passe ou numéro inconnu : le message générique, rien de révélé.
      const wrong = await portalLogin(PHONE, 'Autre123456').expect(401);
      expect(wrong.body.message).toMatch(/incorrect/);
      await portalLogin('242069999999', 'MotDePasse123').expect(401);
    });

    it('journalise la validation sans mot de passe', async () => {
      await publicPost(token, payload()).expect(201);
      const child = (await pending())[0].enfants[0];
      await post(`/family-collection/children/${child.id}/valider`).expect(201);
      const logs = await prisma.auditLog.findMany({
        where: { action: 'FAMILY_COLLECTION_VALIDATE' },
      });
      expect(logs).toHaveLength(1);
      const text = JSON.stringify(logs);
      expect(text).not.toContain('MotDePasse123');
      expect(text).not.toContain('argon2');
      expect(logs[0].userId).not.toBeNull();
    });

    it('ne traite pas deux fois le même enfant (409)', async () => {
      await publicPost(token, payload()).expect(201);
      const child = (await pending())[0].enfants[0];
      await post(`/family-collection/children/${child.id}/valider`).expect(201);
      await post(`/family-collection/children/${child.id}/valider`).expect(409);
      await post(`/family-collection/children/${child.id}/refuser`, admin, {
        motif: 'Doublon',
      }).expect(409);
      expect(await prisma.guardian.count()).toBe(1);
    });

    it('deux validations simultanées ne créent qu’un responsable et un compte', async () => {
      await publicPost(
        token,
        payload({
          enfants: [
            { nom: 'Moukala', prenom: 'Alice', dateNaissance: '2015-04-12' },
          ],
        }),
      ).expect(201);
      const child = (await pending())[0].enfants[0];
      const results = await Promise.all([
        post(`/family-collection/children/${child.id}/valider`),
        post(`/family-collection/children/${child.id}/valider`),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.guardian.count()).toBe(1);
      expect(await prisma.parentAccount.count()).toBe(1);
    });

    it('deux enfants d’un même parent partagent un seul responsable', async () => {
      const brice = await student('Moukala', 'Brice', env.classA.id);
      await publicPost(
        token,
        payload({
          enfants: [
            { nom: 'Moukala', prenom: 'Alice', dateNaissance: '2015-04-12' },
            { nom: 'Moukala', prenom: 'Brice', dateNaissance: '2013-08-01' },
          ],
        }),
      ).expect(201);
      const [sub] = await pending();
      for (const c of sub.enfants) {
        await post(`/family-collection/children/${c.id}/valider`).expect(201);
      }
      expect(await prisma.guardian.count()).toBe(1);
      expect(await prisma.parentAccount.count()).toBe(1);
      expect(await prisma.studentGuardian.count()).toBe(2);
      const links = await prisma.studentGuardian.findMany({
        where: { studentId: { in: [alice.id, brice.id] } },
      });
      expect(links.every((l) => l.prioritaire)).toBe(true);
    });

    it('un frère déjà lié au même numéro est rattaché au même responsable, sans doublon', async () => {
      const brice = await student('Moukala', 'Brice', env.classA.id, {
        responsable: { nom: 'Moukala', prenom: 'Josiane', telephone: PHONE },
      });
      await publicPost(token, payload()).expect(201);
      const child = (await pending())[0].enfants[0];
      const a = child.analyse!;
      expect(a.alertes.map((x) => x.code)).toContain('NUMERO_DEJA_UTILISE');
      expect(a.simple).toBe(true); // information seulement, pas un conflit
      await post(`/family-collection/children/${child.id}/valider`).expect(201);
      expect(await prisma.guardian.count()).toBe(1);
      const guardians = await prisma.studentGuardian.findMany({
        where: { studentId: { in: [alice.id, brice.id] } },
      });
      expect(new Set(guardians.map((g) => g.guardianId)).size).toBe(1);
    });

    it('ne touche jamais au mot de passe d’un compte existant', async () => {
      const first = await student('Moukala', 'Brice', env.classA.id);
      await publicPost(
        token,
        payload({
          enfants: [
            { nom: 'Moukala', prenom: 'Brice', dateNaissance: '2013-08-01' },
          ],
        }),
      ).expect(201);
      const childBrice = (await pending())[0].enfants[0];
      await post(`/family-collection/children/${childBrice.id}/valider`).expect(
        201,
      );
      expect(first.id).toBeTruthy();
      await portalLogin(PHONE, 'MotDePasse123').expect(201);

      // Quelqu'un soumet le même numéro avec un autre mot de passe pour un autre enfant.
      await publicPost(
        token,
        payload({ motDePasse: 'PirateMotDePasse1' }),
      ).expect(201);
      const [sub] = await pending();
      const a = sub.enfants[0].analyse!;
      expect(a.alertes.map((x) => x.code)).toContain('COMPTE_EXISTANT');
      await post(
        `/family-collection/children/${sub.enfants[0].id}/valider`,
      ).expect(201);
      await portalLogin(PHONE, 'MotDePasse123').expect(201);
      await portalLogin(PHONE, 'PirateMotDePasse1').expect(401);
      expect(await prisma.parentAccount.count()).toBe(1);
      expect(await prisma.parentConsent.count()).toBe(1);
    });

    it('bloque une date de naissance différente tant que le secrétariat n’a pas confirmé', async () => {
      await prisma.student.update({
        where: { id: alice.id },
        data: { dateNaissance: new Date('2014-01-01T00:00:00.000Z') },
      });
      await publicPost(token, payload()).expect(201);
      const child = (await pending())[0].enfants[0];
      const a = child.analyse!;
      expect(a.alertes.map((x) => x.code)).toContain('DATE_DIFFERENTE');
      expect(a.simple).toBe(false);

      const refused = await post(
        `/family-collection/children/${child.id}/valider`,
      ).expect(409);
      expect(
        refused.body.alertes.map((x: { code: string }) => x.code),
      ).toContain('DATE_DIFFERENTE');
      // Rien n'a bougé.
      const unchanged = await prisma.student.findUniqueOrThrow({
        where: { id: alice.id },
      });
      expect(unchanged.dateNaissance!.toISOString().slice(0, 10)).toBe(
        '2014-01-01',
      );
      expect(await prisma.guardian.count()).toBe(0);

      await post(`/family-collection/children/${child.id}/valider`, admin, {
        confirmer: true,
      }).expect(201);
      const replaced = await prisma.student.findUniqueOrThrow({
        where: { id: alice.id },
      });
      expect(replaced.dateNaissance!.toISOString().slice(0, 10)).toBe(
        '2015-04-12',
      );
    });

    it('signale un élève qui a déjà un autre responsable, et l’ajoute seulement sur confirmation', async () => {
      await prisma.student.update({
        where: { id: alice.id },
        data: {
          studentGuardians: {
            create: {
              prioritaire: true,
              guardian: {
                create: {
                  schoolId: (await prisma.school.findFirstOrThrow()).id,
                  nom: 'Papa',
                  prenom: 'Pierre',
                  telephone: '242069999000',
                },
              },
            },
          },
        },
      });
      await publicPost(token, payload()).expect(201);
      const child = (await pending())[0].enfants[0];
      const a = child.analyse!;
      expect(a.alertes.map((x) => x.code)).toContain('AUTRE_RESPONSABLE');
      expect(a.simple).toBe(false);
      await post(`/family-collection/children/${child.id}/valider`).expect(409);
      expect(await prisma.studentGuardian.count()).toBe(1);

      await post(`/family-collection/children/${child.id}/valider`, admin, {
        confirmer: true,
      }).expect(201);
      const links = await prisma.studentGuardian.findMany({
        where: { studentId: alice.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(links).toHaveLength(2);
      // Le premier responsable reste le responsable prioritaire.
      expect(links[0].prioritaire).toBe(true);
      expect(links[1].prioritaire).toBe(false);
    });

    it('ne remplace pas le nom d’un responsable existant sans confirmation, mais complète ses champs vides', async () => {
      const school = await prisma.school.findFirstOrThrow();
      await prisma.guardian.create({
        data: {
          schoolId: school.id,
          nom: 'Autre',
          prenom: 'Josiane',
          telephone: PHONE,
        },
      });
      await publicPost(token, payload()).expect(201);
      const child = (await pending())[0].enfants[0];
      expect(child.analyse!.alertes.map((x) => x.code)).toContain(
        'RESPONSABLE_DIFFERENT',
      );
      await post(`/family-collection/children/${child.id}/valider`).expect(409);
      await post(`/family-collection/children/${child.id}/valider`, admin, {
        confirmer: true,
      }).expect(201);
      const g = await prisma.guardian.findFirstOrThrow();
      expect(g.nom).toBe('Moukala');
      expect(g.email).toBe('josiane@example.com');
    });

    it('valide un élève choisi à la main quand le nom n’a pas été reconnu', async () => {
      await publicPost(
        token,
        payload({
          enfants: [
            { nom: 'Mouk', prenom: 'Lili', dateNaissance: '2015-04-12' },
          ],
        }),
      ).expect(201);
      const child = (await pending())[0].enfants[0];
      expect(child.analyse!.match).toBe('AUCUN');
      await post(`/family-collection/children/${child.id}/valider`).expect(422);

      const preview = await get(
        `/family-collection/children/${child.id}/analyse?studentId=${alice.id}`,
      ).expect(200);
      expect(preview.body.match).toBe('CHOISI');
      expect(preview.body.etudiantPropose.id).toBe(alice.id);

      await post(`/family-collection/children/${child.id}/valider`, admin, {
        studentId: alice.id,
      }).expect(201);
      const updated = await prisma.student.findUniqueOrThrow({
        where: { id: alice.id },
      });
      expect(updated.dateNaissance).not.toBeNull();
    });

    it('refuse un élève inconnu ou inactif', async () => {
      await publicPost(token, payload()).expect(201);
      const child = (await pending())[0].enfants[0];
      await post(`/family-collection/children/${child.id}/valider`, admin, {
        studentId: 'inconnu',
      }).expect(404);
      await prisma.student.update({
        where: { id: alice.id },
        data: { statut: 'INACTIF' },
      });
      await post(`/family-collection/children/${child.id}/valider`, admin, {
        studentId: alice.id,
      }).expect(404);
    });
  });

  // ------------------------------------------------------------------ Refus

  describe('refus', () => {
    let token: string;
    beforeEach(async () => {
      await student('Moukala', 'Alice', env.classA.id);
      token = await link(env.classA.id);
    });

    it('exige un motif, efface le mot de passe quand plus rien n’attend et laisse les dossiers intacts', async () => {
      await publicPost(token, payload()).expect(201);
      const child = (await pending())[0].enfants[0];
      await post(`/family-collection/children/${child.id}/refuser`, admin, {
        motif: '',
      }).expect(400);
      const res = await post(
        `/family-collection/children/${child.id}/refuser`,
        admin,
        { motif: 'Ce n’est pas notre élève' },
      ).expect(201);
      expect(res.body.enfants[0]).toMatchObject({
        statut: 'REFUSE',
        motifRefus: 'Ce n’est pas notre élève',
      });
      const stored = await prisma.familySubmission.findFirstOrThrow();
      expect(stored.motDePasseHash).toBeNull();
      expect(await prisma.guardian.count()).toBe(0);
      expect(await prisma.parentAccount.count()).toBe(0);
      // Plus de compte ni de demande en attente : message générique.
      await portalLogin(PHONE, 'MotDePasse123').expect(401);
      expect(await pending()).toHaveLength(0);
    });

    it('un enfant refusé n’empêche pas de valider l’autre ; le mot de passe est utilisé à la validation', async () => {
      await student('Moukala', 'Brice', env.classA.id);
      await publicPost(
        token,
        payload({
          enfants: [
            { nom: 'Moukala', prenom: 'Alice', dateNaissance: '2015-04-12' },
            { nom: 'Moukala', prenom: 'Brice', dateNaissance: '2013-08-01' },
          ],
        }),
      ).expect(201);
      const [sub] = await pending();
      await post(
        `/family-collection/children/${sub.enfants[0].id}/refuser`,
        admin,
        {
          motif: 'Erreur de classe',
        },
      ).expect(201);
      // Le mot de passe est conservé : un enfant attend encore.
      expect(
        (await prisma.familySubmission.findFirstOrThrow()).motDePasseHash,
      ).not.toBeNull();
      await post(
        `/family-collection/children/${sub.enfants[1].id}/valider`,
      ).expect(201);
      await portalLogin(PHONE, 'MotDePasse123').expect(201);
    });

    it('classe les demandes entre « en attente » et « traitées »', async () => {
      await publicPost(token, payload()).expect(201);
      const child = (await pending())[0].enfants[0];
      expect(
        (await get('/family-collection/submissions?statut=TRAITEES')).body,
      ).toHaveLength(0);
      await post(`/family-collection/children/${child.id}/refuser`, admin, {
        motif: 'Doublon',
      }).expect(201);
      const done = (
        await get('/family-collection/submissions?statut=TRAITEES').expect(200)
      ).body;
      expect(done).toHaveLength(1);
      expect(done[0].enfants[0].analyse).toBeNull();
      await get('/family-collection/submissions?statut=AUTRE').expect(400);
    });
  });

  // -------------------------------------------------------- Valider les simples

  describe('validation en un clic des cas simples', () => {
    it('valide les enfants sûrs d’une classe et laisse les autres à l’examen', async () => {
      const token = await link(env.classA.id);
      await student('Moukala', 'Alice', env.classA.id);
      const conflict = await student('Zola', 'Carine', env.classA.id, {
        dateNaissance: '2010-01-01',
      });
      await student('Nzila', 'Diane', env.classA.id);
      const send = (
        nom: string,
        prenom: string,
        tel: string,
        date = '2015-04-12',
      ) =>
        publicPost(
          token,
          payload({
            responsable: { nom, prenom: 'Parent', telephone: tel },
            enfants: [{ nom, prenom, dateNaissance: date }],
          }),
        ).expect(201);
      await send('Moukala', 'Alice', '242060000001');
      await send('Zola', 'Carine', '242060000002'); // date différente : conflit
      await send('Nzila', 'Inconnue', '242060000003'); // aucun rapprochement

      const res = await post(
        `/family-collection/classes/${env.classA.id}/valider-simples`,
      ).expect(201);
      expect(res.body).toEqual({ valides: 1, aExaminer: 2 });
      const left = await pending();
      expect(left).toHaveLength(2);
      expect(await prisma.parentAccount.count()).toBe(1);
      const unchanged = await prisma.student.findUniqueOrThrow({
        where: { id: conflict.id },
      });
      expect(unchanged.dateNaissance!.toISOString().slice(0, 10)).toBe(
        '2010-01-01',
      );
      // Un second clic ne refait rien.
      const again = await post(
        `/family-collection/classes/${env.classA.id}/valider-simples`,
      ).expect(201);
      expect(again.body.valides).toBe(0);
    });
  });

  // ------------------------------------------------------------ Avancement

  describe('avancement par classe', () => {
    it('compte ce qui manque, les demandes en attente et les comptes actifs', async () => {
      const token = await link(env.classA.id);
      await student('Moukala', 'Alice', env.classA.id);
      await student('Zola', 'Carine', env.classA.id, {
        dateNaissance: '2014-02-02',
        responsable: { nom: 'Zola', prenom: 'Paul', telephone: '242060000002' },
      });
      await student('Nzila', 'Diane', env.classA.id);
      await student('Bakala', 'Eva', env.classB.id);

      let rows = (await get('/family-collection/classes').expect(200)).body;
      const a = rows.find((r: { classe: string }) => r.classe === 'CM2 A');
      expect(a).toMatchObject({
        effectif: 3,
        complets: 1,
        sansDate: 2,
        sansResponsable: 2,
        comptesActifs: 0,
        enAttente: 0,
      });
      expect(a.lien.token).toBe(token);
      const b = rows.find((r: { classe: string }) => r.classe === 'CM2 B');
      expect(b.lien).toBeNull();

      await publicPost(token, payload()).expect(201);
      rows = (await get('/family-collection/classes').expect(200)).body;
      expect(
        rows.find((r: { classe: string }) => r.classe === 'CM2 A').enAttente,
      ).toBe(1);

      const child = (await pending())[0].enfants[0];
      await post(`/family-collection/children/${child.id}/valider`).expect(201);
      rows = (await get('/family-collection/classes').expect(200)).body;
      expect(
        rows.find((r: { classe: string }) => r.classe === 'CM2 A'),
      ).toMatchObject({
        complets: 2,
        sansDate: 1,
        sansResponsable: 1,
        comptesActifs: 1,
        enAttente: 0,
      });
    });

    it('liste les élèves d’une classe avec ce qui leur manque', async () => {
      await student('Moukala', 'Alice', env.classA.id);
      await student('Zola', 'Carine', env.classA.id, {
        dateNaissance: '2014-02-02',
        responsable: { nom: 'Zola', prenom: 'Paul', telephone: '242060000002' },
      });
      const res = await get(
        `/family-collection/classes/${env.classA.id}`,
      ).expect(200);
      expect(res.body.classe.nom).toBe('CM2 A');
      expect(res.body.eleves).toHaveLength(2);
      const alice = res.body.eleves.find(
        (e: { prenom: string }) => e.prenom === 'Alice',
      );
      expect(alice).toMatchObject({
        dateNaissance: false,
        responsable: false,
        compte: null,
      });
      const carine = res.body.eleves.find(
        (e: { prenom: string }) => e.prenom === 'Carine',
      );
      expect(carine).toMatchObject({ dateNaissance: true, responsable: true });
    });
  });

  // ----------------------------------------------------------------- Photo d'identité

  describe('photo d’identité de l’enfant (facultative)', () => {
    let token: string;
    let alice: { id: string };
    const familyDir = join(process.cwd(), 'private-uploads', 'family-photos');
    const studentDir = join(process.cwd(), 'private-uploads', 'students');
    const count = (dir: string) =>
      existsSync(dir) ? readdirSync(dir).length : 0;

    beforeEach(async () => {
      alice = await student('Moukala', 'Alice', env.classA.id);
      token = await link(env.classA.id);
    });

    const jpeg = (width = 800, height = 500) =>
      sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 200, g: 60, b: 60 },
        },
      })
        .jpeg()
        .toBuffer();

    const sendWithPhoto = (
      data: object,
      photos: Array<{ field: string; buffer: Buffer; name?: string }>,
    ) => {
      let req = request(app.getHttpServer())
        .post(`/family-collection/public/${token}`)
        .field('payload', JSON.stringify(data));
      for (const p of photos) {
        req = req.attach(p.field, p.buffer, p.name ?? 'photo.jpg');
      }
      return req;
    };

    const childOf = async () => (await pending())[0].enfants[0];

    it('enregistre la photo recadrée en portrait 3:4, hors du dossier public, lisible du seul personnel', async () => {
      const res = await sendWithPhoto(payload(), [
        { field: 'photo_0', buffer: await jpeg() },
      ]);
      expect(res.status).toBe(201);
      expect(res.body.enfants[0].photo).toBe(true);

      const child = await childOf();
      const photo = await get(`/family-collection/children/${child.id}/photo`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(photo.status).toBe(200);
      expect(photo.headers['content-type']).toMatch(/image\/jpeg/);
      expect(photo.headers['cache-control']).toMatch(/no-store/);
      const meta = await sharp(photo.body as Buffer).metadata();
      expect([meta.width, meta.height]).toEqual([450, 600]);

      // Jamais servie publiquement, ni sans jeton, ni à un rôle sans le droit.
      await request(app.getHttpServer())
        .get(`/family-collection/children/${child.id}/photo`)
        .expect(401);
      const stored = await prisma.familySubmissionChild.findFirstOrThrow();
      expect(stored.photoFichier).toMatch(/\.jpg$/);
      await request(app.getHttpServer())
        .get(`/uploads/${stored.photoFichier}`)
        .expect(404);
      const sch = await prisma.school.findFirstOrThrow();
      const { user, motDePasse } = await createUserWithRole(
        prisma,
        sch.id,
        'COMPTABLE',
        { email: 'compta-photo@test.local' },
      );
      const t = await login(user.email, motDePasse);
      await get(`/family-collection/children/${child.id}/photo`, t).expect(403);
    });

    it('un envoi sans photo reste valable, et la photo ne concerne que l’enfant visé', async () => {
      const res = await sendWithPhoto(
        payload({
          enfants: [
            { nom: 'Moukala', prenom: 'Alice', dateNaissance: '2015-04-12' },
            { nom: 'Bakala', prenom: 'Eva', dateNaissance: '2013-08-01' },
          ],
        }),
        [{ field: 'photo_1', buffer: await jpeg(300, 900) }],
      );
      expect(res.status).toBe(201);
      expect(res.body.enfants.map((e: { photo: boolean }) => e.photo)).toEqual([
        false,
        true,
      ]);
      const [first, second] = (
        await prisma.familySubmissionChild.findMany({
          orderBy: { ordre: 'asc' },
        })
      ).map((c) => c.photoFichier);
      expect(first).toBeNull();
      expect(second).not.toBeNull();
    });

    it('refuse un faux fichier image, sans rien enregistrer ni laisser de fichier', async () => {
      const before = count(familyDir);
      const res = await sendWithPhoto(payload(), [
        { field: 'photo_0', buffer: Buffer.from('ceci n’est pas une image') },
      ]);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Moukala|Alice|illisible/);
      expect(await prisma.familySubmission.count()).toBe(0);
      expect(count(familyDir)).toBe(before);
    });

    it('refuse un format qui n’est ni JPEG, ni PNG, ni WebP (GIF)', async () => {
      const gif = await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#0000ff' },
      })
        .gif()
        .toBuffer();
      const res = await sendWithPhoto(payload(), [
        { field: 'photo_0', buffer: gif, name: 'x.gif' },
      ]);
      expect(res.status).toBe(400);
      expect(await prisma.familySubmission.count()).toBe(0);
    });

    it('refuse une photo trop lourde (413), une photo de rang inconnu et un champ inattendu', async () => {
      const before = count(familyDir);
      const big = Buffer.alloc(3 * 1024 * 1024 + 100, 1);
      const tooBig = await sendWithPhoto(payload(), [
        { field: 'photo_0', buffer: big },
      ]);
      expect(tooBig.status).toBe(413);
      const outOfRange = await sendWithPhoto(payload(), [
        { field: 'photo_0', buffer: await jpeg() },
        { field: 'photo_5', buffer: await jpeg() },
      ]);
      expect(outOfRange.status).toBe(400);
      const other = await sendWithPhoto(payload(), [
        { field: 'fichier_0', buffer: await jpeg() },
      ]);
      expect(other.status).toBe(400);
      expect(await prisma.familySubmission.count()).toBe(0);
      expect(count(familyDir)).toBe(before);
    });

    it('un envoi multipart invalide est refusé comme un envoi JSON (consentement)', async () => {
      const res = await sendWithPhoto(payload({ consentement: false }), [
        { field: 'photo_0', buffer: await jpeg() },
      ]);
      expect(res.status).toBe(400);
      expect(await prisma.familySubmission.count()).toBe(0);
    });

    it('la validation pose la photo sur l’élève (dossier privé), efface celle du parent et l’annonce dans l’aperçu', async () => {
      await sendWithPhoto(payload(), [
        { field: 'photo_0', buffer: await jpeg() },
      ]);
      const child = await childOf();
      expect(
        child.analyse!.modifications.some((m) => m.champ === 'photo'),
      ).toBe(true);
      const stored = (await prisma.familySubmissionChild.findFirstOrThrow())
        .photoFichier as string;
      await post(`/family-collection/children/${child.id}/valider`).expect(201);

      const updated = await prisma.student.findUniqueOrThrow({
        where: { id: alice.id },
      });
      expect(updated.photoUrl).toMatch(/\.jpg$/);
      expect(existsSync(join(studentDir, updated.photoUrl as string))).toBe(
        true,
      );
      expect(existsSync(join(familyDir, stored))).toBe(false);
      expect(
        (await prisma.familySubmissionChild.findFirstOrThrow()).photoFichier,
      ).toBeNull();
      const served = await get(`/students/${alice.id}/photo`);
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toMatch(/image\/jpeg/);
    });

    it('une photo déjà au dossier n’est remplacée que sur confirmation, l’ancienne est supprimée', async () => {
      const oldName = 'ancienne-photo.jpg';
      mkdirSync(studentDir, { recursive: true });
      writeFileSync(join(studentDir, oldName), await jpeg(100, 133));
      await prisma.student.update({
        where: { id: alice.id },
        data: { photoUrl: oldName },
      });
      await sendWithPhoto(payload(), [
        { field: 'photo_0', buffer: await jpeg() },
      ]);
      const child = await childOf();
      expect(child.analyse!.alertes.map((a) => a.code)).toContain(
        'PHOTO_DIFFERENTE',
      );
      expect(child.analyse!.simple).toBe(false);
      await post(`/family-collection/children/${child.id}/valider`).expect(409);
      expect(
        (await prisma.student.findUniqueOrThrow({ where: { id: alice.id } }))
          .photoUrl,
      ).toBe(oldName);

      await post(`/family-collection/children/${child.id}/valider`, admin, {
        confirmer: true,
      }).expect(201);
      const replaced = await prisma.student.findUniqueOrThrow({
        where: { id: alice.id },
      });
      expect(replaced.photoUrl).not.toBe(oldName);
      expect(existsSync(join(studentDir, oldName))).toBe(false);
      expect(existsSync(join(studentDir, replaced.photoUrl as string))).toBe(
        true,
      );
    });

    it('refuser un enfant supprime sa photo', async () => {
      await sendWithPhoto(payload(), [
        { field: 'photo_0', buffer: await jpeg() },
      ]);
      const child = await childOf();
      const stored = (await prisma.familySubmissionChild.findFirstOrThrow())
        .photoFichier as string;
      expect(existsSync(join(familyDir, stored))).toBe(true);
      await post(`/family-collection/children/${child.id}/refuser`, admin, {
        motif: 'Pas notre élève',
      }).expect(201);
      expect(existsSync(join(familyDir, stored))).toBe(false);
      await get(`/family-collection/children/${child.id}/photo`).expect(404);
    });

    it('le journal ne contient jamais le nom du fichier de la photo', async () => {
      await sendWithPhoto(payload(), [
        { field: 'photo_0', buffer: await jpeg() },
      ]);
      const stored = (await prisma.familySubmissionChild.findFirstOrThrow())
        .photoFichier as string;
      const child = await childOf();
      await post(`/family-collection/children/${child.id}/valider`).expect(201);
      const logs = JSON.stringify(await prisma.auditLog.findMany());
      expect(logs).not.toContain(stored);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays } from '../src/timetable/timetable.util';

/**
 * Lot 16 : cahier de textes et devoirs. L'enseignant écrit pour SES couples classe-matière, lit les classes où il
 * enseigne ; la Direction, l'Administrateur et la vie scolaire lisent tout ; les parents voient le cahier de la classe de
 * leur enfant, en lecture seule.
 */
describe('Cahier de textes et devoirs (e2e, Lot 16)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const PHONE_MOUKALA = '242060000001';
  const PHONE_ZOLA = '242060000002';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    admin = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string, motDePasse: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, motDePasse })
      .expect(201);
    return res.body.accessToken;
  }

  const get = (path: string, t: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const post = (path: string, t: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const put = (path: string, t: string, body: object) =>
    request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const patch = (path: string, t: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const del = (path: string, t: string) =>
    request(app.getHttpServer())
      .delete(path)
      .set('Authorization', `Bearer ${t}`);

  async function account(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      sch.id,
      roleCode,
      { email },
    );
    return { user, token: await login(user.email, motDePasse) };
  }

  /** Année active, deux classes, deux matières, deux enseignants avec compte, trois élèves de deux familles. */
  async function setup() {
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
    const math = (
      await post('/subjects', admin, { code: 'MATH', nom: 'Mathématiques' })
    ).body;
    const fran = (
      await post('/subjects', admin, { code: 'FRAN', nom: 'Français' })
    ).body;
    const scie = (
      await post('/subjects', admin, { code: 'SCIE', nom: 'Sciences' })
    ).body;
    for (const s of [math, fran, scie]) {
      await put(`/subjects/${s.id}/levels`, admin, {
        levels: [{ levelId: level.id }],
      }).expect(200);
    }
    const t1 = (
      await post('/teachers', admin, { nom: 'Ngoma', prenom: 'Paul' })
    ).body;
    const t2 = (
      await post('/teachers', admin, { nom: 'Okemba', prenom: 'Jean' })
    ).body;
    await post('/assignments', admin, {
      classId: classA.id,
      subjectId: math.id,
      teacherId: t1.id,
    }).expect(201);
    await post('/assignments', admin, {
      classId: classA.id,
      subjectId: fran.id,
      teacherId: t2.id,
    }).expect(201);
    await post('/assignments', admin, {
      classId: classB.id,
      subjectId: math.id,
      teacherId: t2.id,
    }).expect(201);

    const feeType = (
      await post('/fee-types', admin, {
        code: 'INSCRIPTION',
        nom: "Frais d'inscription",
        obligatoire: true,
        avecTranches: false,
      })
    ).body;
    await post('/fee-schedules', admin, {
      academicYearId: year.id,
      levelId: level.id,
      feeTypeId: feeType.id,
      montant: 45000,
    }).expect(201);
    const mk = async (
      nom: string,
      prenom: string,
      resp: { nom: string; prenom: string; telephone: string },
      classId: string,
    ) => {
      const student = (
        await post('/students', admin, {
          nom,
          prenom,
          sexe: 'F',
          dateNaissance: '2015-04-12',
          responsable: { ...resp, lien: 'Parent' },
        }).expect(201)
      ).body;
      await post('/enrollments', admin, {
        studentId: student.id,
        classId,
        academicYearId: year.id,
      }).expect(201);
      return student as { id: string; prenom: string };
    };
    const moukala = {
      nom: 'Moukala',
      prenom: 'Jean',
      telephone: PHONE_MOUKALA,
    };
    const zola = { nom: 'Zola', prenom: 'Marie', telephone: PHONE_ZOLA };
    const alice = await mk('Moukala', 'Alice', moukala, classA.id);
    const brice = await mk('Moukala', 'Brice', moukala, classA.id);
    const carine = await mk('Zola', 'Carine', zola, classB.id);

    const paul = await account('ENSEIGNANT', 'paul@test.local');
    const jean = await account('ENSEIGNANT', 'jean@test.local');
    await prisma.teacher.update({
      where: { id: t1.id },
      data: { userId: paul.user.id },
    });
    await prisma.teacher.update({
      where: { id: t2.id },
      data: { userId: jean.user.id },
    });
    const direction = await account('DIRECTION', 'direction@test.local');
    const guardians = await prisma.guardian.findMany();
    const guardianOf = (tel: string) =>
      guardians.find((g) => g.telephone === tel)!;
    return {
      year,
      classA,
      classB,
      math,
      fran,
      scie,
      alice,
      brice,
      carine,
      paul,
      jean,
      direction,
      moukala: guardianOf(PHONE_MOUKALA),
      zola: guardianOf(PHONE_ZOLA),
    };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;

  const entry = (s: Setup, extra: object = {}) => ({
    classId: s.classA.id,
    subjectId: s.math.id,
    date: today,
    contenu: 'Les fractions : addition et soustraction.',
    devoirs: 'Exercices 4 et 5 page 32.',
    dateEcheance: addDays(today, 2),
    ...extra,
  });

  // ------------------------------------------------------------------ Écriture

  describe('écriture par l’enseignant', () => {
    it('crée une entrée pour SA matière et la restitue avec ses droits de modification', async () => {
      const s = await setup();
      const res = await post('/textbook', s.paul.token, entry(s)).expect(201);
      expect(res.body).toMatchObject({
        className: 'CM2 A',
        subjectName: 'Mathématiques',
        teacherName: 'Paul Ngoma',
        date: today,
        contenu: 'Les fractions : addition et soustraction.',
        devoirs: 'Exercices 4 et 5 page 32.',
        dateEcheance: addDays(today, 2),
        modifiable: true,
      });
    });

    it('refuse la matière d’un collègue, une matière sans enseignant, un compte sans fiche et un compte sans droit d’écriture', async () => {
      const s = await setup();
      await post(
        '/textbook',
        s.paul.token,
        entry(s, { subjectId: s.fran.id }),
      ).expect(403); // français : Jean
      await post(
        '/textbook',
        s.paul.token,
        entry(s, { classId: s.classB.id }),
      ).expect(403); // maths de CM2 B : Jean
      await post(
        '/textbook',
        s.paul.token,
        entry(s, { subjectId: s.scie.id }),
      ).expect(422); // aucun enseignant
      const orphan = await account('ENSEIGNANT', 'orphelin@test.local');
      await post('/textbook', orphan.token, entry(s)).expect(403);
      const surv = await account('SURVEILLANT', 'surv@test.local');
      await post('/textbook', surv.token, entry(s)).expect(403); // il lit, il n'écrit pas
      await post('/textbook', s.direction.token, entry(s)).expect(403);
      expect(await prisma.textbookEntry.count()).toBe(0);
    });

    it('valide les textes et les dates', async () => {
      const s = await setup();
      const bad = (extra: object) =>
        post('/textbook', s.paul.token, entry(s, extra));
      await bad({
        contenu: undefined,
        devoirs: undefined,
        dateEcheance: undefined,
      }).expect(422); // aucun texte
      await bad({
        contenu: '   ',
        devoirs: '  ',
        dateEcheance: undefined,
      }).expect(422);
      await bad({ dateEcheance: addDays(today, -1) }).expect(422); // avant la séance
      await bad({ date: addDays(today, 1) }).expect(422); // pas à l'avance
      await bad({ date: addDays(today, -200), dateEcheance: undefined }).expect(
        422,
      ); // avant l'année
      await bad({ contenu: 'x'.repeat(2001) }).expect(400); // trop long
      await bad({ date: '25/09/2026' }).expect(400);
      expect(await prisma.textbookEntry.count()).toBe(0);
    });

    it('un contenu seul est accepté, et une échéance sans devoir est ignorée', async () => {
      const s = await setup();
      const res = await post(
        '/textbook',
        s.paul.token,
        entry(s, { devoirs: undefined, dateEcheance: addDays(today, 3) }),
      ).expect(201);
      expect(res.body).toMatchObject({
        contenu: 'Les fractions : addition et soustraction.',
        devoirs: null,
        dateEcheance: null,
      });
    });

    it('seul l’auteur modifie ou supprime son entrée', async () => {
      const s = await setup();
      const created = (
        await post('/textbook', s.paul.token, entry(s)).expect(201)
      ).body;
      await patch(`/textbook/${created.id}`, s.jean.token, {
        contenu: 'Vandalisme',
      }).expect(403);
      await del(`/textbook/${created.id}`, s.jean.token).expect(403);
      await patch(`/textbook/${created.id}`, s.direction.token, {
        contenu: 'x',
      }).expect(403);

      const updated = (
        await patch(`/textbook/${created.id}`, s.paul.token, {
          devoirs: 'Exercice 6.',
          dateEcheance: '',
        }).expect(200)
      ).body;
      expect(updated).toMatchObject({
        devoirs: 'Exercice 6.',
        dateEcheance: null,
        contenu: 'Les fractions : addition et soustraction.',
      });
      // Effacer les deux textes laisse une entrée vide : refusé.
      await patch(`/textbook/${created.id}`, s.paul.token, {
        contenu: '',
        devoirs: '',
      }).expect(422);
      await patch(`/textbook/${created.id}`, s.paul.token, {
        dateEcheance: addDays(today, -3),
      }).expect(422);
      await del(`/textbook/${created.id}`, s.paul.token).expect(200);
      expect(await prisma.textbookEntry.count()).toBe(0);
      await del(`/textbook/${created.id}`, s.paul.token).expect(404);
    });

    it('une année clôturée n’accepte plus rien', async () => {
      const s = await setup();
      const created = (
        await post('/textbook', s.paul.token, entry(s)).expect(201)
      ).body;
      await prisma.academicYear.update({
        where: { id: s.year.id },
        data: { statut: 'CLOTUREE' },
      });
      await post('/textbook', s.paul.token, entry(s)).expect(409);
      await patch(`/textbook/${created.id}`, s.paul.token, {
        contenu: 'Autre',
      }).expect(409);
      await del(`/textbook/${created.id}`, s.paul.token).expect(409);
    });

    it('le journal garde les identifiants et jamais le texte', async () => {
      const s = await setup();
      const created = (
        await post('/textbook', s.paul.token, entry(s)).expect(201)
      ).body;
      await patch(`/textbook/${created.id}`, s.paul.token, {
        devoirs: 'Texte secret du devoir',
      }).expect(200);
      await del(`/textbook/${created.id}`, s.paul.token).expect(200);
      const logs = await prisma.auditLog.findMany({
        where: {
          action: {
            in: ['TEXTBOOK_CREATE', 'TEXTBOOK_UPDATE', 'TEXTBOOK_DELETE'],
          },
        },
      });
      expect(logs.map((l) => l.action).sort()).toEqual([
        'TEXTBOOK_CREATE',
        'TEXTBOOK_DELETE',
        'TEXTBOOK_UPDATE',
      ]);
      const dump = JSON.stringify(logs);
      expect(dump).not.toContain('Texte secret du devoir');
      expect(dump).not.toContain('fractions');
      expect(dump).not.toContain('Exercices 4');
    });
  });

  // ------------------------------------------------------------------ Lecture

  describe('lecture', () => {
    it('un enseignant lit les classes où il enseigne (toutes matières), pas les autres', async () => {
      const s = await setup();
      await post('/textbook', s.paul.token, entry(s)).expect(201); // maths CM2 A
      await post(
        '/textbook',
        s.jean.token,
        entry(s, {
          subjectId: s.fran.id,
          contenu: 'La dictée',
          devoirs: undefined,
          dateEcheance: undefined,
        }),
      ).expect(201);
      await post(
        '/textbook',
        s.jean.token,
        entry(s, { classId: s.classB.id }),
      ).expect(201); // maths CM2 B

      const paul = (await get('/textbook', s.paul.token).expect(200))
        .body as Array<{
        className: string;
        subjectName: string;
        modifiable: boolean;
      }>;
      // Paul n'enseigne qu'en CM2 A : il y voit les mathématiques ET le français, jamais CM2 B.
      expect(paul.map((e) => `${e.className}:${e.subjectName}`).sort()).toEqual(
        ['CM2 A:Français', 'CM2 A:Mathématiques'],
      );
      expect(paul.find((e) => e.subjectName === 'Français')!.modifiable).toBe(
        false,
      ); // celle d'un collègue
      expect(
        paul.find((e) => e.subjectName === 'Mathématiques')!.modifiable,
      ).toBe(true);
      await get(`/textbook?classId=${s.classB.id}`, s.paul.token).expect(403);

      const jean = (await get('/textbook', s.jean.token).expect(200))
        .body as unknown[];
      expect(jean).toHaveLength(3);
    });

    it('la Direction, l’Administrateur et la vie scolaire lisent toute l’école, sans pouvoir modifier', async () => {
      const s = await setup();
      await post('/textbook', s.paul.token, entry(s)).expect(201);
      await post(
        '/textbook',
        s.jean.token,
        entry(s, { classId: s.classB.id }),
      ).expect(201);
      const surv = await account('SURVEILLANT', 'surv@test.local');
      for (const token of [s.direction.token, admin, surv.token]) {
        const rows = (await get('/textbook', token).expect(200)).body as Array<{
          modifiable: boolean;
        }>;
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.modifiable === false)).toBe(true);
      }
      const filtered = (
        await get(`/textbook?classId=${s.classB.id}`, s.direction.token).expect(
          200,
        )
      ).body as unknown[];
      expect(filtered).toHaveLength(1);
    });

    it('l’auditeur, le secrétariat et le comptable n’y ont aucun accès', async () => {
      const s = await setup();
      await post('/textbook', s.paul.token, entry(s)).expect(201);
      for (const [role, email] of [
        ['AUDITEUR', 'aud@test.local'],
        ['SECRETAIRE_CAISSIER', 'sec@test.local'],
        ['COMPTABLE', 'compta@test.local'],
      ]) {
        const a = await account(role, email);
        const res = await get('/textbook', a.token);
        expect({ role, status: res.status }).toEqual({ role, status: 403 });
        await get('/textbook/context', a.token).expect(403);
      }
    });

    it('la fenêtre par défaut couvre 30 jours ; from et to la précisent', async () => {
      const s = await setup();
      await post(
        '/textbook',
        s.paul.token,
        entry(s, { date: addDays(today, -40), dateEcheance: undefined }),
      ).expect(201);
      await post(
        '/textbook',
        s.paul.token,
        entry(s, { date: addDays(today, -5), dateEcheance: undefined }),
      ).expect(201);
      expect(
        ((await get('/textbook', s.paul.token).expect(200)).body as unknown[])
          .length,
      ).toBe(1);
      const wide = (
        await get(`/textbook?from=${addDays(today, -60)}`, s.paul.token).expect(
          200,
        )
      ).body as unknown[];
      expect(wide).toHaveLength(2);
      const narrow = (
        await get(
          `/textbook?from=${addDays(today, -60)}&to=${addDays(today, -30)}`,
          s.paul.token,
        ).expect(200)
      ).body as unknown[];
      expect(narrow).toHaveLength(1);
    });

    it('le contexte donne à l’enseignant ses matières, à la Direction toutes les affectations', async () => {
      const s = await setup();
      const paul = (await get('/textbook/context', s.paul.token).expect(200))
        .body;
      expect(paul.peutEcrire).toBe(true);
      expect(
        paul.affectations.map((a: { subjectName: string }) => a.subjectName),
      ).toEqual(['Mathématiques']);
      expect(paul.classes.map((c: { nom: string }) => c.nom)).toEqual([
        'CM2 A',
      ]);
      const dir = (
        await get('/textbook/context', s.direction.token).expect(200)
      ).body;
      expect(dir.peutEcrire).toBe(false);
      expect(dir.affectations).toHaveLength(3);
      expect(dir.classes).toHaveLength(2);
    });
  });

  // ------------------------------------------------------------------ Parents

  describe('portail parent', () => {
    const portalGet = (path: string, t: string) =>
      request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${t}`);

    async function activeParent(guardianId: string, telephone: string) {
      const { body } = await post(
        `/parent-accounts/guardians/${guardianId}/activation-code`,
        admin,
      ).expect(201);
      const res = await request(app.getHttpServer())
        .post('/portal/activate')
        .send({
          telephone,
          code: body.code,
          motDePasse: 'MotDePasse123',
          consentement: true,
          versionPolitique: '2026-09-v7',
        })
        .expect(201);
      return res.body.accessToken as string;
    }

    it('un parent voit le cahier de la classe de son enfant, jamais celui d’une autre classe', async () => {
      const s = await setup();
      await post('/textbook', s.paul.token, entry(s)).expect(201); // CM2 A
      await post(
        '/textbook',
        s.jean.token,
        entry(s, {
          classId: s.classB.id,
          contenu: 'Cahier de CM2 B',
          devoirs: undefined,
          dateEcheance: undefined,
        }),
      ).expect(201);
      const moukala = await activeParent(s.moukala.id, PHONE_MOUKALA);
      const zola = await activeParent(s.zola.id, PHONE_ZOLA);

      const a = (
        await portalGet(
          `/portal/children/${s.alice.id}/textbook`,
          moukala,
        ).expect(200)
      ).body;
      expect(a.classe).toBe('CM2 A');
      expect(a.entrees).toHaveLength(1);
      expect(a.entrees[0]).toMatchObject({
        matiere: 'Mathématiques',
        enseignant: 'Paul Ngoma',
        devoirs: 'Exercices 4 et 5 page 32.',
      });
      expect(JSON.stringify(a)).not.toContain('CM2 B');

      const c = (
        await portalGet(
          `/portal/children/${s.carine.id}/textbook`,
          zola,
        ).expect(200)
      ).body;
      expect(c.classe).toBe('CM2 B');
      expect(c.entrees).toHaveLength(1);
      expect(c.entrees[0].contenu).toBe('Cahier de CM2 B');
    });

    it('404 pour l’enfant d’une autre famille, refus d’un jeton du personnel', async () => {
      const s = await setup();
      await post('/textbook', s.paul.token, entry(s)).expect(201);
      const moukala = await activeParent(s.moukala.id, PHONE_MOUKALA);
      await portalGet(
        `/portal/children/${s.carine.id}/textbook`,
        moukala,
      ).expect(404);
      await portalGet(`/portal/children/inconnu/textbook`, moukala).expect(404);
      await portalGet(
        `/portal/children/${s.alice.id}/textbook`,
        s.paul.token,
      ).expect(401);
    });

    it('les devoirs à rendre passent en premier ; un vieux devoir encore à rendre y reste, une vieille entrée disparaît', async () => {
      const s = await setup();
      await post(
        '/textbook',
        s.paul.token,
        entry(s, { devoirs: 'Loin', dateEcheance: addDays(today, 6) }),
      ).expect(201);
      await post(
        '/textbook',
        s.paul.token,
        entry(s, { devoirs: 'Proche', dateEcheance: addDays(today, 1) }),
      ).expect(201);
      // Vieille séance (20 jours) : son devoir est encore à rendre, sa ligne du cahier est trop ancienne.
      await post(
        '/textbook',
        s.paul.token,
        entry(s, {
          date: addDays(today, -20),
          devoirs: 'Long projet',
          dateEcheance: addDays(today, 3),
        }),
      ).expect(201);
      // Vieille séance sans devoir à rendre : absente.
      await post(
        '/textbook',
        s.paul.token,
        entry(s, {
          date: addDays(today, -25),
          devoirs: 'Fini',
          dateEcheance: addDays(today, -22),
        }),
      ).expect(201);
      const parent = await activeParent(s.moukala.id, PHONE_MOUKALA);
      const res = (
        await portalGet(
          `/portal/children/${s.alice.id}/textbook`,
          parent,
        ).expect(200)
      ).body;
      expect(res.aVenir.map((e: { devoirs: string }) => e.devoirs)).toEqual([
        'Proche',
        'Long projet',
        'Loin',
      ]);
      expect(res.entrees).toHaveLength(2);
      expect(JSON.stringify(res)).not.toContain('Fini');
    });

    it('un devoir prévient les responsables de la classe, sans jamais en dire le contenu, et seulement à la création', async () => {
      const s = await setup();
      const moukala = await activeParent(s.moukala.id, PHONE_MOUKALA);
      const zola = await activeParent(s.zola.id, PHONE_ZOLA);
      const notifs = async (t: string) => {
        await app.get(NotificationsService).idle();
        const res = await portalGet('/portal/notifications', t).expect(200);
        return (
          (res.body.notifications ?? res.body) as Array<{
            type: string;
            corps: string;
          }>
        ).filter((n) => n.type === 'DEVOIR_DONNE');
      };

      // Un simple contenu de séance : aucune alerte.
      await post(
        '/textbook',
        s.paul.token,
        entry(s, { devoirs: undefined, dateEcheance: undefined }),
      ).expect(201);
      expect(await notifs(moukala)).toHaveLength(0);

      // Un devoir dont l'échéance est déjà passée : aucune alerte.
      await post(
        '/textbook',
        s.paul.token,
        entry(s, {
          date: addDays(today, -5),
          dateEcheance: addDays(today, -1),
        }),
      ).expect(201);
      expect(await notifs(moukala)).toHaveLength(0);

      // Un devoir à rendre : une alerte par enfant de la classe, aucune pour l'autre classe.
      const created = (
        await post('/textbook', s.paul.token, entry(s)).expect(201)
      ).body;
      const list = await notifs(moukala);
      expect(list).toHaveLength(2); // Alice et Brice
      for (const n of list) {
        expect(n.corps).toMatch(/devoir de Mathématiques/i);
        expect(n.corps).not.toContain('Exercices 4 et 5');
        expect(n.corps).not.toContain('page 32');
      }
      expect(await notifs(zola)).toHaveLength(0);

      // Modifier ne prévient personne de nouveau.
      await patch(`/textbook/${created.id}`, s.paul.token, {
        devoirs: 'Exercices 6 et 7.',
      }).expect(200);
      expect(await notifs(moukala)).toHaveLength(2);
    });
  });
});

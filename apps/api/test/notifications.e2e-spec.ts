import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PUSH_SENDER } from '../src/notifications/push-sender.interface';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { FakePushSender } from './utils/fake-push-sender';
import { addDays, weekdayOf } from '../src/timetable/timetable.util';

/**
 * Lot 12 : notifications aux parents (D65, D69, D70, D71, RV08, RV10). Deux familles : Alice et Brice
 * (responsable Moukala, Brice a aussi Mme Ndinga) dans CM2 A, et Carine (responsable Zola) dans CM2 B.
 */
describe('Notifications aux parents (e2e, Lot 12)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let push: FakePushSender;
  let token: string;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const PHONE_MOUKALA = '242060000001';
  const PHONE_ZOLA = '242060000002';
  const PHONE_NDINGA = '242060000003';
  const ENDPOINT = 'https://push.example.test/device-1';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    notifications = app.get(NotificationsService);
    push = app.get(PUSH_SENDER);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    push.reset();
    token = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await notifications.idle();
    await app.close();
  });

  async function login(email: string, motDePasse: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, motDePasse })
      .expect(201);
    return res.body.accessToken;
  }

  const post = (path: string, body: object, t?: string) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t ?? token}`)
      .send(body);
  const patch = (path: string, body: object, t?: string) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${t ?? token}`)
      .send(body);
  const put = (path: string, body: object, t?: string) =>
    request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${t ?? token}`)
      .send(body);

  async function userToken(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      sch.id,
      roleCode,
      { email },
    );
    return login(user.email, motDePasse);
  }

  /** Deux classes, trois élèves, un emploi du temps publié avec deux séances aujourd'hui pour CM2 A. */
  async function school() {
    await patch('/pedagogy/settings', {
      joursClasse: [0, 1, 2, 3, 4, 5, 6],
    }).expect(200);
    const section = (
      await post('/sections', { code: 'FR', nom: 'Francophone' })
    ).body;
    const cycle = (
      await post('/cycles', {
        sectionId: section.id,
        code: 'PRIM',
        nom: 'Primaire',
      })
    ).body;
    const level = (
      await post('/levels', { cycleId: cycle.id, code: 'CM2', nom: 'CM2' })
    ).body;
    const year = (
      await post('/academic-years', {
        libelle: '2026-2027',
        dateDebut: addDays(today, -120),
        dateFin: addDays(today, 200),
      })
    ).body;
    const klassA = (
      await post('/classes', {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 A',
      })
    ).body;
    const klassB = (
      await post('/classes', {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 B',
      })
    ).body;

    const mkStudent = async (
      nom: string,
      prenom: string,
      responsable: { nom: string; prenom: string; telephone: string },
      classId: string,
    ) => {
      const student = (
        await post('/students', {
          nom,
          prenom,
          sexe: 'F',
          dateNaissance: '2015-04-12',
          responsable: { ...responsable, lien: 'Parent' },
        }).expect(201)
      ).body;
      await post('/enrollments', {
        studentId: student.id,
        classId,
        academicYearId: year.id,
      }).expect(201);
      return student;
    };
    const moukala = {
      nom: 'Moukala',
      prenom: 'Jean',
      telephone: PHONE_MOUKALA,
    };
    const alice = await mkStudent('Moukala', 'Alice', moukala, klassA.id);
    const brice = await mkStudent('Moukala', 'Brice', moukala, klassA.id);
    const carine = await mkStudent(
      'Zola',
      'Carine',
      { nom: 'Zola', prenom: 'Marie', telephone: PHONE_ZOLA },
      klassB.id,
    );
    await post(`/students/${brice.id}/guardians`, {
      nom: 'Ndinga',
      prenom: 'Rose',
      telephone: PHONE_NDINGA,
      lien: 'Tante',
    }).expect(201);

    const h1 = (
      await post('/time-slots', {
        libelle: 'H1',
        heureDebut: '08:00',
        heureFin: '08:50',
      })
    ).body;
    const h2 = (
      await post('/time-slots', {
        libelle: 'H2',
        heureDebut: '09:00',
        heureFin: '09:50',
      })
    ).body;
    const math = (
      await post('/subjects', { code: 'MATH', nom: 'Mathématiques' })
    ).body;
    await put(`/subjects/${math.id}/levels`, {
      levels: [{ levelId: level.id }],
    }).expect(200);
    const teacher = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' }))
      .body;
    const replacement = (
      await post('/teachers', { nom: 'Bello', prenom: 'Luc' })
    ).body;
    await post('/assignments', {
      classId: klassA.id,
      subjectId: math.id,
      teacherId: teacher.id,
    }).expect(201);
    const teacherB = (
      await post('/teachers', { nom: 'Okemba', prenom: 'Anne' })
    ).body;
    await post('/assignments', {
      classId: klassB.id,
      subjectId: math.id,
      teacherId: teacherB.id,
    }).expect(201);
    const room1 = (await post('/rooms', { nom: 'Salle 1' })).body;
    const room2 = (await post('/rooms', { nom: 'Salle 2' })).body;
    const room3 = (await post('/rooms', { nom: 'Salle 3' })).body;
    const tt = (
      await post('/timetables', { academicYearId: year.id }).expect(201)
    ).body;
    const mk = async (
      classId: string,
      timeSlotId: string,
      roomId: string,
      teacherId?: string,
    ) =>
      (
        await post(`/timetables/${tt.id}/entries`, {
          classId,
          subjectId: math.id,
          timeSlotId,
          jourSemaine: weekdayOf(today),
          roomId,
          ...(teacherId ? { teacherId } : {}),
        }).expect(201)
      ).body;
    const entryA1 = await mk(klassA.id, h1.id, room1.id);
    const entryA2 = await mk(klassA.id, h2.id, room1.id);
    const entryB1 = await mk(klassB.id, h1.id, room2.id);
    await post(`/timetables/${tt.id}/publish`, {
      dateEffet: addDays(today, -30),
    }).expect(201);

    const guardians = await prisma.guardian.findMany();
    const g = (tel: string) => guardians.find((x) => x.telephone === tel)!;
    return {
      year,
      klassA,
      alice,
      brice,
      carine,
      entryA1,
      entryA2,
      entryB1,
      replacement,
      room2,
      room3,
      moukala: g(PHONE_MOUKALA),
      zola: g(PHONE_ZOLA),
      ndinga: g(PHONE_NDINGA),
    };
  }

  async function activeParent(guardianId: string, telephone: string) {
    const { body } = await post(
      `/parent-accounts/guardians/${guardianId}/activation-code`,
      {},
    ).expect(201);
    const res = await request(app.getHttpServer())
      .post('/portal/activate')
      .send({
        telephone,
        code: body.code,
        motDePasse: 'MotDePasse123',
        consentement: true,
        versionPolitique: '2026-09-v4',
      })
      .expect(201);
    return res.body.accessToken as string;
  }

  /** Les trois responsables activent leur compte ; renvoie leurs jetons. */
  async function parents(s: Awaited<ReturnType<typeof school>>) {
    return {
      moukala: await activeParent(s.moukala.id, PHONE_MOUKALA),
      zola: await activeParent(s.zola.id, PHONE_ZOLA),
      ndinga: await activeParent(s.ndinga.id, PHONE_NDINGA),
    };
  }

  const pget = (path: string, t: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const ppost = (path: string, body: object, t: string) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const pput = (path: string, body: object, t: string) =>
    request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const ppatch = (path: string, body: object, t: string) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);

  async function subscribe(t: string, endpoint = ENDPOINT) {
    await ppost(
      '/portal/push/subscriptions',
      { endpoint, keys: { p256dh: 'clePublique', auth: 'secretAuth' } },
      t,
    ).expect(201);
  }

  async function call(entryId: string, absences: object[]) {
    const res = await post('/attendance/calls', {
      entryId,
      date: today,
      absences,
    }).expect(201);
    await notifications.idle();
    return res;
  }

  async function listOf(t: string) {
    return (await pget('/portal/notifications', t).expect(200)).body as {
      nonLues: number;
      notifications: Array<{
        id: string;
        type: string;
        titre: string;
        corps: string;
        occurrences: number;
        enfant: { id: string; prenom: string };
        lue: boolean;
      }>;
    };
  }

  describe('absence saisie : alerte reçue sans contenu sensible (D69, RV10)', () => {
    it('le message dans l’application donne le détail, l’alerte push reste générique', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.moukala);
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);

      const list = await listOf(p.moukala);
      expect(list.notifications).toHaveLength(1);
      expect(list.notifications[0]).toMatchObject({
        type: 'ABSENCE',
        titre: 'Absence signalée',
        enfant: { prenom: 'Alice' },
        lue: false,
      });
      // Dans l'application authentifiée : le détail de la séance.
      expect(list.notifications[0].corps).toContain('Mathématiques');
      expect(list.notifications[0].corps).toContain('08:00');

      // Sur le canal externe : le prénom et un renvoi vers l'application, rien d'autre.
      expect(push.sent).toHaveLength(1);
      const payload = push.sent[0].payload;
      expect(payload.body).toContain('Alice');
      expect(payload.body).toContain('absence');
      expect(payload.url).toBe('/parents/notifications');
      expect(JSON.stringify(payload)).not.toMatch(
        /Mathématiques|08:00|09:00|motif|Maladie|FCFA|note/i,
      );
    });

    it('un retard est notifié comme tel, avec sa durée dans l’application seulement', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.moukala);
      await call(s.entryA1.id, [{ studentId: s.alice.id, minutesRetard: 5 }]);
      const [n] = (await listOf(p.moukala)).notifications;
      expect(n).toMatchObject({ type: 'RETARD', titre: 'Retard signalé' });
      expect(n.corps).toContain('5 minutes');
      expect(push.sent[0].payload.body).toContain('retard');
      expect(push.sent[0].payload.body).not.toContain('5 minutes');
    });

    it('un appel renvoyé à l’identique (coupure, synchronisation) ne renotifie personne', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.moukala);
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      const list = await listOf(p.moukala);
      expect(list.notifications).toHaveLength(1);
      expect(list.notifications[0].occurrences).toBe(1);
      expect(push.sent).toHaveLength(1);
    });

    it('un élève présent ne déclenche aucune notification', async () => {
      const s = await school();
      const p = await parents(s);
      await call(s.entryA1.id, []);
      expect((await listOf(p.moukala)).notifications).toHaveLength(0);
    });

    it('aucun événement financier n’existe parmi les types de notification (D70)', async () => {
      const s = await school();
      const p = await parents(s);
      const prefs = (
        await pget('/portal/notification-preferences', p.moukala).expect(200)
      ).body;
      expect(prefs.preferences.map((x: { type: string }) => x.type)).toEqual([
        'ABSENCE',
        'RETARD',
        'ENSEIGNANT_ABSENT',
        'EMPLOI_DU_TEMPS_MODIFIE',
        'MESSAGE_RECU',
        'ANNONCE',
        'BULLETIN_DISPONIBLE',
        'DEVOIR_DONNE',
      ]);
    });
  });

  describe('isolation (RV08, D67)', () => {
    it('seuls les responsables de l’élève sont prévenus', async () => {
      const s = await school();
      const p = await parents(s);
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      expect((await listOf(p.moukala)).notifications).toHaveLength(1);
      // Mme Ndinga est responsable de Brice, pas d'Alice ; Mme Zola d'une autre classe.
      expect((await listOf(p.ndinga)).notifications).toHaveLength(0);
      expect((await listOf(p.zola)).notifications).toHaveLength(0);
    });

    it('un parent ne peut pas lire ni marquer lue la notification d’une autre famille', async () => {
      const s = await school();
      const p = await parents(s);
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      const id = (await listOf(p.moukala)).notifications[0].id;
      await ppatch(`/portal/notifications/${id}/read`, {}, p.zola).expect(404);
      expect((await listOf(p.zola)).notifications).toHaveLength(0);
      expect(
        (await prisma.parentNotification.findUniqueOrThrow({ where: { id } }))
          .luAt,
      ).toBeNull();
    });

    it('après le retrait de l’accès à un enfant, ses notifications disparaissent et plus aucune n’est envoyée', async () => {
      const s = await school();
      const p = await parents(s);
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      const first = (await listOf(p.moukala)).notifications;
      expect(first).toHaveLength(1);
      // Lue : sans cela, une éventuelle fuite serait absorbée par le regroupement et passerait inaperçue.
      await ppatch(
        `/portal/notifications/${first[0].id}/read`,
        {},
        p.moukala,
      ).expect(200);

      const dir = await userToken('DIRECTION', 'dir@test.local');
      const link = await prisma.studentGuardian.findFirstOrThrow({
        where: { guardianId: s.moukala.id, studentId: s.alice.id },
      });
      await patch(
        `/parent-accounts/links/${link.id}/access`,
        { acces: false, motif: 'Décision de justice' },
        dir,
      ).expect(200);

      expect((await listOf(p.moukala)).notifications).toHaveLength(0);
      expect(
        (
          await pget('/portal/notifications/unread-count', p.moukala).expect(
            200,
          )
        ).body.nonLues,
      ).toBe(0);
      await subscribe(p.moukala);
      await call(s.entryA2.id, [{ studentId: s.alice.id, absent: true }]);
      expect(push.sent).toHaveLength(0);
      expect(
        await prisma.parentNotification.count({
          where: { studentId: s.alice.id },
        }),
      ).toBe(1);
    });

    it('un compte désactivé ne reçoit plus rien', async () => {
      const s = await school();
      const p = await parents(s);
      await post(
        `/parent-accounts/guardians/${s.moukala.id}/deactivate`,
        {},
      ).expect(201);
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      expect(await prisma.parentNotification.count()).toBe(0);
      await pget('/portal/notifications', p.moukala).expect(401);
    });

    it('le portail des notifications exige un jeton de parent, jamais celui du personnel', async () => {
      await request(app.getHttpServer())
        .get('/portal/notifications')
        .expect(401);
      await pget('/portal/notifications', token).expect(401);
      await pget('/portal/notification-preferences', token).expect(401);
      await ppost(
        '/portal/push/subscriptions',
        { endpoint: ENDPOINT, keys: { p256dh: 'a', auth: 'b' } },
        token,
      ).expect(401);
    });
  });

  describe('préférences respectées (D71)', () => {
    it('par défaut toutes les alertes push sont activées, et les préférences se modifient', async () => {
      const s = await school();
      const p = await parents(s);
      const first = (
        await pget('/portal/notification-preferences', p.moukala).expect(200)
      ).body;
      expect(first.pushDisponible).toBe(true);
      expect(first.appareils).toBe(0);
      expect(first.preferences.every((x: { push: boolean }) => x.push)).toBe(
        true,
      );

      const after = (
        await pput(
          '/portal/notification-preferences',
          { preferences: [{ type: 'ABSENCE', push: false }] },
          p.moukala,
        ).expect(200)
      ).body;
      expect(
        after.preferences.find((x: { type: string }) => x.type === 'ABSENCE')
          .push,
      ).toBe(false);
      expect(
        after.preferences.find((x: { type: string }) => x.type === 'RETARD')
          .push,
      ).toBe(true);
      await pput(
        '/portal/notification-preferences',
        { preferences: [{ type: 'INCONNU', push: false }] },
        p.moukala,
      ).expect(400);
      await pput(
        '/portal/notification-preferences',
        { preferences: [{ type: 'ABSENCE', push: 'non' }] },
        p.moukala,
      ).expect(400);
    });

    it('un type coupé n’envoie pas d’alerte mais reste dans l’application ; les autres types continuent', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.moukala);
      await pput(
        '/portal/notification-preferences',
        { preferences: [{ type: 'ABSENCE', push: false }] },
        p.moukala,
      ).expect(200);

      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      expect(push.sent).toHaveLength(0);
      expect((await listOf(p.moukala)).notifications).toHaveLength(1);
      expect(
        (await prisma.parentNotification.findFirstOrThrow()).pushStatut,
      ).toBe('DESACTIVE');

      await call(s.entryA2.id, [{ studentId: s.brice.id, minutesRetard: 4 }]);
      expect(push.sent).toHaveLength(1);
      expect(push.sent[0].payload.body).toContain('retard');
    });

    it('sans appareil enregistré, la notification reste dans l’application', async () => {
      const s = await school();
      const p = await parents(s);
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      expect((await listOf(p.moukala)).notifications).toHaveLength(1);
      expect(
        (await prisma.parentNotification.findFirstOrThrow()).pushStatut,
      ).toBe('AUCUN_APPAREIL');
      expect(push.sent).toHaveLength(0);
    });
  });

  describe('envoi en échec sans bloquer la saisie', () => {
    it('un service push qui refuse ne fait pas échouer l’appel, l’échec est tracé', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.moukala);
      push.mode = 'fail';
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      const row = await prisma.parentNotification.findFirstOrThrow();
      expect(row.pushStatut).toBe('ECHEC');
      expect(row.pushErreur).toContain('500');
      expect(
        await prisma.attendanceRecord.count({
          where: { studentId: s.alice.id, statut: 'ABSENT' },
        }),
      ).toBe(1);
      expect((await listOf(p.moukala)).notifications).toHaveLength(1);
    });

    it('un service push qui lève une exception ne fait pas échouer l’appel non plus', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.moukala);
      push.mode = 'throw';
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      expect(
        (await prisma.parentNotification.findFirstOrThrow()).pushStatut,
      ).toBe('ECHEC');
      expect(
        await prisma.attendanceRecord.count({ where: { statut: 'ABSENT' } }),
      ).toBe(1);
    });

    it('même si tout le mécanisme de notification tombe en panne, l’appel est enregistré', async () => {
      const s = await school();
      await parents(s);
      jest
        .spyOn(
          notifications as unknown as { deliver: () => Promise<void> },
          'deliver',
        )
        .mockRejectedValue(new Error('panne'));
      await post('/attendance/calls', {
        entryId: s.entryA1.id,
        date: today,
        absences: [{ studentId: s.alice.id, absent: true }],
      }).expect(201);
      expect(
        await prisma.attendanceRecord.count({
          where: { studentId: s.alice.id, statut: 'ABSENT' },
        }),
      ).toBe(1);
      expect(await prisma.parentNotification.count()).toBe(0);
    });

    it('un appareil disparu (abonnement expiré) est supprimé et n’empêche rien', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.moukala);
      push.mode = 'expired';
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      expect(await prisma.parentPushSubscription.count()).toBe(0);
      expect(
        (await prisma.parentNotification.findFirstOrThrow()).pushStatut,
      ).toBe('AUCUN_APPAREIL');
    });
  });

  describe('regroupement (D71)', () => {
    it('un enfant absent toute la journée ne déclenche qu’une seule alerte, le message est complété', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.moukala);
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      await call(s.entryA2.id, [{ studentId: s.alice.id, absent: true }]);

      const list = await listOf(p.moukala);
      expect(list.notifications).toHaveLength(1);
      expect(list.notifications[0].occurrences).toBe(2);
      expect(list.notifications[0].corps).toContain('2 absences');
      expect(push.sent).toHaveLength(1);
    });

    it('une fois la notification lue, l’absence suivante déclenche une nouvelle alerte', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.moukala);
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      const first = (await listOf(p.moukala)).notifications[0];
      await ppatch(
        `/portal/notifications/${first.id}/read`,
        {},
        p.moukala,
      ).expect(200);

      // Correction : présente, puis de nouveau absente, ce qui est un vrai changement.
      await call(s.entryA1.id, []);
      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      const list = await listOf(p.moukala);
      expect(list.notifications).toHaveLength(2);
      expect(list.nonLues).toBe(1);
      expect(push.sent).toHaveLength(2);
    });

    it('un retard et une absence sont deux événements distincts', async () => {
      const s = await school();
      const p = await parents(s);
      await call(s.entryA1.id, [{ studentId: s.alice.id, minutesRetard: 5 }]);
      await call(s.entryA2.id, [{ studentId: s.alice.id, absent: true }]);
      expect(
        (await listOf(p.moukala)).notifications.map((n) => n.type).sort(),
      ).toEqual(['ABSENCE', 'RETARD']);
    });
  });

  describe('enseignant absent et changements d’emploi du temps', () => {
    it('une séance annulée prévient les responsables de la classe, sans jamais transmettre le motif', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.moukala);
      await post(`/timetable-entries/${s.entryA1.id}/exceptions`, {
        date: today,
        type: 'ANNULEE',
        motif: 'Décès dans la famille de l’enseignant',
      }).expect(201);
      await notifications.idle();

      // CM2 A : Moukala (deux enfants) et Ndinga (Brice). Pas Zola (CM2 B).
      const moukala = await listOf(p.moukala);
      expect(moukala.notifications.map((n) => n.enfant.prenom).sort()).toEqual([
        'Alice',
        'Brice',
      ]);
      expect(
        moukala.notifications.every((n) => n.type === 'ENSEIGNANT_ABSENT'),
      ).toBe(true);
      expect((await listOf(p.ndinga)).notifications).toHaveLength(1);
      expect((await listOf(p.zola)).notifications).toHaveLength(0);

      const everything = JSON.stringify([
        moukala,
        await listOf(p.ndinga),
        push.sent,
      ]);
      expect(everything).not.toMatch(/Décès|motif/i);
      // Une seule alerte pour le responsable de deux enfants de la classe, qui nomme les deux.
      expect(push.sent).toHaveLength(1);
      expect(push.sent[0].payload.body).toMatch(
        /Alice et Brice|Brice et Alice/,
      );
    });

    it('un remplacement d’enseignant est signalé comme tel', async () => {
      const s = await school();
      const p = await parents(s);
      await post(`/timetable-entries/${s.entryA1.id}/exceptions`, {
        date: today,
        type: 'REMPLACEE',
        replacementTeacherId: s.replacement.id,
        motif: 'Maladie',
      }).expect(201);
      await notifications.idle();
      const [n] = (await listOf(p.ndinga)).notifications;
      expect(n.type).toBe('ENSEIGNANT_ABSENT');
      expect(n.corps).toContain('un autre enseignant');
      expect(n.corps).not.toContain('Bello');
      expect(n.corps).not.toContain('Maladie');
    });

    it('les changements de salle sont regroupés en une seule alerte', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.ndinga);
      await post(`/timetable-entries/${s.entryA1.id}/exceptions`, {
        date: today,
        type: 'SALLE_MODIFIEE',
        roomId: s.room3.id,
        motif: 'Travaux',
      }).expect(201);
      await notifications.idle();
      await post(`/timetable-entries/${s.entryA2.id}/exceptions`, {
        date: today,
        type: 'SALLE_MODIFIEE',
        roomId: s.room2.id,
        motif: 'Travaux',
      }).expect(201);
      await notifications.idle();

      const list = await listOf(p.ndinga);
      expect(list.notifications).toHaveLength(1);
      expect(list.notifications[0]).toMatchObject({
        type: 'EMPLOI_DU_TEMPS_MODIFIE',
        occurrences: 2,
      });
      expect(list.notifications[0].corps).toContain('2 changements');
      expect(push.sent).toHaveLength(1);
      expect(push.sent[0].payload.body).toContain('emploi du temps');
    });

    it('un changement sur un jour déjà passé n’envoie aucune alerte', async () => {
      const s = await school();
      await parents(s);
      // La séance a lieu le même jour de la semaine, la semaine dernière : version en vigueur, jour passé.
      const past = addDays(today, -7);
      await post(`/timetable-entries/${s.entryA1.id}/exceptions`, {
        date: past,
        type: 'ANNULEE',
        motif: 'Test',
      }).expect(201);
      await notifications.idle();
      expect(await prisma.parentNotification.count()).toBe(0);
    });

    it('la publication d’un nouvel emploi du temps prévient les responsables des élèves inscrits', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.zola);
      const draft = (
        await post('/timetables', { academicYearId: s.year.id }).expect(201)
      ).body;
      await post(`/timetables/${draft.id}/publish`, {
        dateEffet: today,
      }).expect(201);
      await notifications.idle();

      expect((await listOf(p.moukala)).notifications).toHaveLength(2); // Alice et Brice
      expect((await listOf(p.ndinga)).notifications).toHaveLength(1);
      const zola = await listOf(p.zola);
      expect(zola.notifications).toHaveLength(1);
      expect(zola.notifications[0]).toMatchObject({
        type: 'EMPLOI_DU_TEMPS_MODIFIE',
        enfant: { prenom: 'Carine' },
      });
      expect(push.sent).toHaveLength(1);
    });

    it('un échec de notification ne bloque pas la publication', async () => {
      const s = await school();
      await parents(s);
      jest
        .spyOn(
          notifications as unknown as { deliver: () => Promise<void> },
          'deliver',
        )
        .mockRejectedValue(new Error('panne'));
      const draft = (
        await post('/timetables', { academicYearId: s.year.id }).expect(201)
      ).body;
      await post(`/timetables/${draft.id}/publish`, {
        dateEffet: today,
      }).expect(201);
      expect(
        (await prisma.timetable.findUniqueOrThrow({ where: { id: draft.id } }))
          .statut,
      ).toBe('PUBLIE');
    });
  });

  describe('lecture et appareils', () => {
    it('marque lue une notification ou toutes, et compte les non lues', async () => {
      const s = await school();
      const p = await parents(s);
      await call(s.entryA1.id, [
        { studentId: s.alice.id, absent: true },
        { studentId: s.brice.id, minutesRetard: 3 },
      ]);
      expect(
        (
          await pget('/portal/notifications/unread-count', p.moukala).expect(
            200,
          )
        ).body.nonLues,
      ).toBe(2);
      const first = (await listOf(p.moukala)).notifications[0];
      await ppatch(
        `/portal/notifications/${first.id}/read`,
        {},
        p.moukala,
      ).expect(200);
      expect(
        (
          await pget('/portal/notifications/unread-count', p.moukala).expect(
            200,
          )
        ).body.nonLues,
      ).toBe(1);
      const res = await ppost(
        '/portal/notifications/read-all',
        {},
        p.moukala,
      ).expect(201);
      expect(res.body.marquees).toBe(1);
      expect((await listOf(p.moukala)).nonLues).toBe(0);
      await ppatch('/portal/notifications/inconnue/read', {}, p.moukala).expect(
        404,
      );
    });

    it('enregistre l’appareil une seule fois, exige une adresse https, et le retire', async () => {
      const s = await school();
      const p = await parents(s);
      expect(
        (await pget('/portal/push/public-key', p.moukala).expect(200)).body
          .publicKey,
      ).toBe('BFakePublicKeyForTests');
      await subscribe(p.moukala);
      await subscribe(p.moukala);
      expect(await prisma.parentPushSubscription.count()).toBe(1);
      await ppost(
        '/portal/push/subscriptions',
        {
          endpoint: 'http://pas-securise.test/x',
          keys: { p256dh: 'a', auth: 'b' },
        },
        p.moukala,
      ).expect(400);
      await ppost(
        '/portal/push/subscriptions',
        { endpoint: ENDPOINT },
        p.moukala,
      ).expect(400);

      await ppost(
        '/portal/push/unsubscribe',
        { endpoint: ENDPOINT },
        p.zola,
      ).expect(201);
      expect(await prisma.parentPushSubscription.count()).toBe(1); // un autre parent ne retire pas cet appareil
      await ppost(
        '/portal/push/unsubscribe',
        { endpoint: ENDPOINT },
        p.moukala,
      ).expect(201);
      expect(await prisma.parentPushSubscription.count()).toBe(0);
    });

    it('un téléphone partagé suit le parent qui vient de se connecter, jamais le précédent', async () => {
      const s = await school();
      const p = await parents(s);
      await subscribe(p.moukala);
      await subscribe(p.zola); // même appareil, autre parent
      expect(await prisma.parentPushSubscription.count()).toBe(1);

      await call(s.entryA1.id, [{ studentId: s.alice.id, absent: true }]);
      expect(push.sent).toHaveLength(0); // Alice concerne Moukala, dont l'appareil est passé à Zola
      await call(s.entryB1.id, [{ studentId: s.carine.id, absent: true }]);
      expect(push.sent).toHaveLength(1);
    });

    it('sans clé configurée, l’application l’indique et les notifications restent dans l’application', async () => {
      const s = await school();
      const p = await parents(s);
      push.publicKey = null;
      const prefs = (
        await pget('/portal/notification-preferences', p.moukala).expect(200)
      ).body;
      expect(prefs.pushDisponible).toBe(false);
      expect(
        (await pget('/portal/push/public-key', p.moukala).expect(200)).body
          .publicKey,
      ).toBeNull();
    });
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PUSH_SENDER } from '../src/notifications/push-sender.interface';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { FakePushSender } from './utils/fake-push-sender';
import { addDays } from '../src/timetable/timetable.util';

/**
 * Lot 13 : messagerie sécurisée et annonces (RV09, RV11, D72 à D75). Classe CM2 A : Alice et Brice (responsable
 * Moukala, Brice a aussi Mme Ndinga), enseignant M. Ngoma. Classe CM2 B : Carine (Mme Zola), enseignante Mme Okemba.
 * M. Bello est enseignant mais n'est affecté à aucune classe.
 */
describe('Messagerie sécurisée et annonces (e2e, Lot 13)', () => {
  // Le jeu de données (plusieurs utilisateurs, hachage argon2) dépasse parfois les 5 s par défaut sur une machine chargée.
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let push: FakePushSender;
  let admin: string;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const PHONE_MOUKALA = '242060000001';
  const PHONE_ZOLA = '242060000002';
  const PHONE_NDINGA = '242060000003';
  const TEACHER_PHONE = '06 111 22 33';

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
    admin = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
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

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object, t?: string) =>
    http()
      .post(path)
      .set('Authorization', `Bearer ${t ?? admin}`)
      .send(body);
  const patch = (path: string, body: object, t?: string) =>
    http()
      .patch(path)
      .set('Authorization', `Bearer ${t ?? admin}`)
      .send(body);
  const put = (path: string, body: object, t?: string) =>
    http()
      .put(path)
      .set('Authorization', `Bearer ${t ?? admin}`)
      .send(body);
  const get = (path: string, t: string) =>
    http().get(path).set('Authorization', `Bearer ${t}`);

  async function staff(
    roleCode: string,
    email: string,
    teacherId?: string,
    name?: { nom: string; prenom: string },
  ) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      sch.id,
      roleCode,
      {
        email,
        nom: name?.nom ?? email.split('@')[0],
        prenom: name?.prenom ?? 'Compte',
      },
    );
    if (teacherId)
      await prisma.teacher.update({
        where: { id: teacherId },
        data: { userId: user.id },
      });
    return { id: user.id, token: await login(user.email, motDePasse) };
  }

  async function activeParent(guardianId: string, telephone: string) {
    const { body } = await post(
      `/parent-accounts/guardians/${guardianId}/activation-code`,
      {},
    ).expect(201);
    const res = await http()
      .post('/portal/activate')
      .send({
        telephone,
        code: body.code,
        motDePasse: 'MotDePasse123',
        consentement: true,
        versionPolitique: '2026-09-v6',
      })
      .expect(201);
    return res.body.accessToken as string;
  }

  /** Deux classes, quatre enseignants, trois responsables (Mme Ndinga sans compte tant qu'on ne l'active pas). */
  async function world(opts: { activateNdinga?: boolean } = {}) {
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
    const alice = await mkStudent(
      'Moukala',
      'Alice',
      { nom: 'Moukala', prenom: 'Jean', telephone: PHONE_MOUKALA },
      klassA.id,
    );
    const brice = await mkStudent(
      'Moukala',
      'Brice',
      { nom: 'Moukala', prenom: 'Jean', telephone: PHONE_MOUKALA },
      klassA.id,
    );
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

    const math = (
      await post('/subjects', { code: 'MATH', nom: 'Mathématiques' })
    ).body;
    await put(`/subjects/${math.id}/levels`, {
      levels: [{ levelId: level.id }],
    }).expect(200);
    const tNgoma = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' }))
      .body;
    const tOkemba = (await post('/teachers', { nom: 'Okemba', prenom: 'Anne' }))
      .body;
    const tBello = (await post('/teachers', { nom: 'Bello', prenom: 'Luc' }))
      .body;
    await prisma.teacher.update({
      where: { id: tNgoma.id },
      data: { telephone: TEACHER_PHONE, email: 'ngoma.perso@exemple.test' },
    });
    await post('/assignments', {
      classId: klassA.id,
      subjectId: math.id,
      teacherId: tNgoma.id,
    }).expect(201);
    await post('/assignments', {
      classId: klassB.id,
      subjectId: math.id,
      teacherId: tOkemba.id,
    }).expect(201);

    const guardians = await prisma.guardian.findMany();
    const g = (tel: string) => guardians.find((x) => x.telephone === tel)!;
    const ngoma = await staff('ENSEIGNANT', 'ngoma@test.local', tNgoma.id, {
      nom: 'Ngoma',
      prenom: 'Paul',
    });
    const okemba = await staff('ENSEIGNANT', 'okemba@test.local', tOkemba.id, {
      nom: 'Okemba',
      prenom: 'Anne',
    });
    const bello = await staff('ENSEIGNANT', 'bello@test.local', tBello.id, {
      nom: 'Bello',
      prenom: 'Luc',
    });
    const dir = await staff('DIRECTION', 'dir@test.local');
    const surv = await staff('SURVEILLANT', 'surv@test.local');
    const cpt = await staff('COMPTABLE', 'cpt@test.local');
    return {
      alice,
      brice,
      carine,
      klassA,
      klassB,
      math,
      tNgoma,
      tOkemba,
      tBello,
      ngoma,
      okemba,
      bello,
      dir,
      surv,
      cpt,
      moukala: g(PHONE_MOUKALA),
      zola: g(PHONE_ZOLA),
      ndinga: g(PHONE_NDINGA),
      pMoukala: await activeParent(g(PHONE_MOUKALA).id, PHONE_MOUKALA),
      pZola: await activeParent(g(PHONE_ZOLA).id, PHONE_ZOLA),
      pNdinga:
        opts.activateNdinga === false
          ? ''
          : await activeParent(g(PHONE_NDINGA).id, PHONE_NDINGA),
    };
  }
  type World = Awaited<ReturnType<typeof world>>;

  const parentWrites = (
    w: World,
    t: string,
    studentId: string,
    teacherId: string | undefined,
    texte = 'Bonjour, une question sur les devoirs.',
  ) =>
    post(
      '/portal/messages/threads',
      { studentId, ...(teacherId ? { teacherId } : { ecole: true }), texte },
      t,
    );

  /** Un fil entre Mme Moukala et M. Ngoma à propos d'Alice, ouvert par la mère. */
  async function threadWithNgoma(w: World) {
    const res = await parentWrites(
      w,
      w.pMoukala,
      w.alice.id,
      w.tNgoma.id,
    ).expect(201);
    return res.body.id as string;
  }

  // ==================================================================================== RV09

  describe('le couple enseignant / responsable est autorisé côté serveur (RV09, D72)', () => {
    it('un responsable ne voit comme interlocuteurs que les enseignants de la classe de son enfant, et l’école', async () => {
      const w = await world();
      const res = await get(
        `/portal/messages/contacts?studentId=${w.alice.id}`,
        w.pMoukala,
      ).expect(200);
      expect(res.body.ecole).toBe(true);
      expect(res.body.classe).toBe('CM2 A');
      expect(res.body.enseignants.map((t: { nom: string }) => t.nom)).toEqual([
        'Ngoma',
      ]);
      expect(res.body.enseignants[0].matieres).toEqual(['Mathématiques']);
      expect(Object.keys(res.body.enseignants[0]).sort()).toEqual([
        'id',
        'matieres',
        'nom',
        'prenom',
      ]);
      // L'enfant d'une autre famille : introuvable, pas « interdit ».
      await get(
        `/portal/messages/contacts?studentId=${w.carine.id}`,
        w.pMoukala,
      ).expect(404);
      await get(
        `/portal/messages/contacts?studentId=${w.alice.id}`,
        w.pNdinga,
      ).expect(404); // Mme Ndinga n'a que Brice
    });

    it('un responsable ne peut pas écrire à un enseignant qui n’est pas affecté à la classe de son enfant', async () => {
      const w = await world();
      await parentWrites(w, w.pMoukala, w.alice.id, w.tOkemba.id).expect(403); // classe voisine
      await parentWrites(w, w.pMoukala, w.alice.id, w.tBello.id).expect(403); // aucune affectation
      await parentWrites(w, w.pMoukala, w.alice.id, 'inconnu').expect(403);
      expect(await prisma.messageThread.count()).toBe(0);
      await parentWrites(w, w.pMoukala, w.alice.id, w.tNgoma.id).expect(201);
    });

    it('un responsable ne peut pas écrire à propos de l’enfant d’une autre famille, ni choisir deux interlocuteurs ou aucun', async () => {
      const w = await world();
      await parentWrites(w, w.pMoukala, w.carine.id, w.tOkemba.id).expect(404);
      await parentWrites(w, w.pNdinga, w.alice.id, w.tNgoma.id).expect(404);
      await post(
        '/portal/messages/threads',
        { studentId: w.alice.id, texte: 'x' },
        w.pMoukala,
      ).expect(400);
      await post(
        '/portal/messages/threads',
        {
          studentId: w.alice.id,
          teacherId: w.tNgoma.id,
          ecole: true,
          texte: 'x',
        },
        w.pMoukala,
      ).expect(400);
      expect(await prisma.messageThread.count()).toBe(0);
    });

    it('un enseignant écrit aux responsables des élèves de sa classe, pas à ceux d’une autre classe', async () => {
      const w = await world();
      await post(
        '/messaging/threads',
        { studentId: w.alice.id, guardianId: w.moukala.id, texte: 'Bonjour' },
        w.ngoma.token,
      ).expect(201);
      await post(
        '/messaging/threads',
        { studentId: w.carine.id, guardianId: w.zola.id, texte: 'Bonjour' },
        w.ngoma.token,
      ).expect(403);
      await post(
        '/messaging/threads',
        { studentId: w.alice.id, guardianId: w.moukala.id, texte: 'Bonjour' },
        w.okemba.token,
      ).expect(403);
      await post(
        '/messaging/threads',
        { studentId: w.alice.id, guardianId: w.moukala.id, texte: 'Bonjour' },
        w.bello.token,
      ).expect(403);
      expect(await prisma.messageThread.count()).toBe(1);
    });

    it('on ne peut écrire qu’à un responsable réellement rattaché à l’élève', async () => {
      const w = await world();
      await post(
        '/messaging/threads',
        { studentId: w.alice.id, guardianId: w.ndinga.id, texte: 'Bonjour' },
        w.ngoma.token,
      ).expect(404); // Mme Ndinga n'est pas responsable d'Alice
      await post(
        '/messaging/threads',
        { studentId: w.alice.id, guardianId: w.zola.id, texte: 'Bonjour' },
        w.surv.token,
      ).expect(404);
    });

    it('les enseignants n’obtiennent la liste des responsables que pour leurs propres classes', async () => {
      const w = await world();
      const mine = await get(
        `/messaging/recipients?classId=${w.klassA.id}`,
        w.ngoma.token,
      ).expect(200);
      expect(mine.body.map((s: { prenom: string }) => s.prenom).sort()).toEqual(
        ['Alice', 'Brice'],
      );
      const brice = mine.body.find(
        (s: { prenom: string }) => s.prenom === 'Brice',
      );
      expect(
        brice.responsables.map((r: { nom: string }) => r.nom).sort(),
      ).toEqual(['Moukala', 'Ndinga']);
      await get(
        `/messaging/recipients?classId=${w.klassB.id}`,
        w.ngoma.token,
      ).expect(403);
      await get(
        `/messaging/recipients?classId=${w.klassA.id}`,
        w.bello.token,
      ).expect(403);
      expect(
        (await get('/messaging/classes', w.ngoma.token).expect(200)).body.map(
          (c: { nom: string }) => c.nom,
        ),
      ).toEqual(['CM2 A']);
      expect(
        (await get('/messaging/classes', w.surv.token).expect(200)).body
          .map((c: { nom: string }) => c.nom)
          .sort(),
      ).toEqual(['CM2 A', 'CM2 B']);
      await get(
        `/messaging/recipients?classId=${w.klassB.id}`,
        w.surv.token,
      ).expect(200);
    });

    it('la vie scolaire et la Direction (guichet de l’école) écrivent à tout responsable, et se partagent la conversation', async () => {
      const w = await world();
      const res = await post(
        '/messaging/threads',
        {
          studentId: w.carine.id,
          guardianId: w.zola.id,
          texte: 'Rendez-vous demain.',
        },
        w.surv.token,
      ).expect(201);
      expect(res.body.type).toBe('ECOLE');
      // Mme Zola répond à « l'école » : le même fil, lisible par la Direction.
      const own = (await get('/portal/messages/threads', w.pZola).expect(200))
        .body.threads[0];
      expect(own.interlocuteur).toBe("L'école");
      await post(
        `/portal/messages/threads/${own.id}/messages`,
        { texte: 'Entendu.' },
        w.pZola,
      ).expect(201);
      const seenByDir = await get(
        `/messaging/threads/${res.body.id}`,
        w.dir.token,
      ).expect(200);
      expect(seenByDir.body.messages).toHaveLength(2);
      // Un enseignant, lui, ne voit pas le fil de l'école.
      await get(`/messaging/threads/${res.body.id}`, w.okemba.token).expect(
        404,
      );
    });

    it('les conversations sont cloisonnées : chacun ne lit que les siennes', async () => {
      const w = await world();
      const id = await threadWithNgoma(w);
      await get(`/portal/messages/threads/${id}`, w.pMoukala).expect(200);
      await get(`/portal/messages/threads/${id}`, w.pZola).expect(404);
      await get(`/portal/messages/threads/${id}`, w.pNdinga).expect(404);
      await post(
        `/portal/messages/threads/${id}/messages`,
        { texte: 'intrus' },
        w.pZola,
      ).expect(404);
      await get(`/messaging/threads/${id}`, w.ngoma.token).expect(200);
      await get(`/messaging/threads/${id}`, w.okemba.token).expect(404);
      await get(`/messaging/threads/${id}`, w.bello.token).expect(404);
      await post(
        `/messaging/threads/${id}/messages`,
        { texte: 'intrus' },
        w.okemba.token,
      ).expect(404);
      expect(
        (await get('/messaging/threads', w.okemba.token).expect(200)).body,
      ).toHaveLength(0);
      expect(
        (await get('/portal/messages/threads', w.pZola).expect(200)).body
          .threads,
      ).toHaveLength(0);
    });

    it('un enseignant qui n’est plus affecté à la classe ne peut plus écrire, et le parent non plus, mais l’historique reste lisible', async () => {
      const w = await world();
      const id = await threadWithNgoma(w);
      await prisma.teachingAssignment.deleteMany({
        where: { teacherId: w.tNgoma.id },
      });
      await post(
        `/messaging/threads/${id}/messages`,
        { texte: 'Réponse' },
        w.ngoma.token,
      ).expect(403);
      await post(
        `/portal/messages/threads/${id}/messages`,
        { texte: 'Relance' },
        w.pMoukala,
      ).expect(422);
      const view = await get(
        `/portal/messages/threads/${id}`,
        w.pMoukala,
      ).expect(200);
      expect(view.body.peutRepondre).toBe(false);
      expect(view.body.messages).toHaveLength(1);
      // Il reste possible d'écrire à l'école.
      await parentWrites(
        w,
        w.pMoukala,
        w.alice.id,
        undefined,
        'Je m’adresse à l’école.',
      ).expect(201);
    });

    it('le retrait d’accès à un enfant coupe la messagerie sur cet enfant des deux côtés', async () => {
      const w = await world();
      const id = await threadWithNgoma(w);
      const link = await prisma.studentGuardian.findFirstOrThrow({
        where: { guardianId: w.moukala.id, studentId: w.alice.id },
      });
      await patch(
        `/parent-accounts/links/${link.id}/access`,
        { acces: false, motif: 'Décision de justice' },
        w.dir.token,
      ).expect(200);
      await get(`/portal/messages/threads/${id}`, w.pMoukala).expect(404);
      await post(
        `/portal/messages/threads/${id}/messages`,
        { texte: 'x' },
        w.pMoukala,
      ).expect(404);
      expect(
        (await get('/portal/messages/threads', w.pMoukala).expect(200)).body
          .threads,
      ).toHaveLength(0);
      await post(
        `/messaging/threads/${id}/messages`,
        { texte: 'x' },
        w.ngoma.token,
      ).expect(422);
      await post(
        '/messaging/threads',
        { studentId: w.alice.id, guardianId: w.moukala.id, texte: 'x' },
        w.ngoma.token,
      ).expect(422);
    });

    it('on ne peut pas écrire à un responsable qui n’a pas de compte actif', async () => {
      const w = await world({ activateNdinga: false });
      await post(
        '/messaging/threads',
        { studentId: w.brice.id, guardianId: w.ndinga.id, texte: 'Bonjour' },
        w.ngoma.token,
      ).expect(422);
      // Le compte désactivé n'est pas joignable non plus.
      await post(
        `/parent-accounts/guardians/${w.moukala.id}/deactivate`,
        {},
      ).expect(201);
      await post(
        '/messaging/threads',
        { studentId: w.alice.id, guardianId: w.moukala.id, texte: 'Bonjour' },
        w.ngoma.token,
      ).expect(422);
      // La liste proposée aux enseignants ne contient que les responsables joignables.
      const list = await get(
        `/messaging/recipients?classId=${w.klassA.id}`,
        w.ngoma.token,
      ).expect(200);
      expect(
        list.body.flatMap((s: { responsables: unknown[] }) => s.responsables),
      ).toHaveLength(0);
    });

    it('la messagerie est réservée à ceux qui ont la permission, et chaque portail à ses propres jetons', async () => {
      const w = await world();
      await http().get('/messaging/threads').expect(401);
      await get('/messaging/threads', w.cpt.token).expect(403);
      await get('/messaging/threads', w.pMoukala).expect(401); // jeton de parent sur une route du personnel
      await get('/portal/messages/threads', w.ngoma.token).expect(401); // jeton du personnel sur le portail
      await get('/portal/announcements', admin).expect(401);
    });
  });

  // =========================================================================== Aucun numéro

  describe('aucun numéro personnel n’est échangé ni affiché (RV09)', () => {
    const NUMBERS = [
      '06 12 34 56 78',
      '+242 06 000 0001',
      '0612345678',
      'mon numéro : 06.12.34.56.78',
      'appelez le 242-06-000-0001 svp',
    ];

    it('un message qui contient un numéro de téléphone est refusé, dans les deux sens', async () => {
      const w = await world();
      const id = await threadWithNgoma(w);
      for (const n of NUMBERS) {
        await post(
          `/portal/messages/threads/${id}/messages`,
          { texte: `Bonjour ${n}` },
          w.pMoukala,
        ).expect(422);
        await post(
          `/messaging/threads/${id}/messages`,
          { texte: `Rappelez-moi ${n}` },
          w.ngoma.token,
        ).expect(422);
        await parentWrites(w, w.pMoukala, w.alice.id, undefined, n).expect(422);
      }
      expect(await prisma.message.count()).toBe(1); // le message d'ouverture seulement
      // Un refus lors de l'ouverture ne laisse pas de conversation vide.
      expect(await prisma.messageThread.count()).toBe(1);
    });

    it('les dates, les montants et les numéros courts ne sont pas pris pour des numéros', async () => {
      const w = await world();
      const id = await threadWithNgoma(w);
      for (const ok of [
        'Le contrôle est le 21.09.2026.',
        'Il reste 45000 FCFA à régler.',
        'Salle 12, 3e étage, 2 heures.',
        'Matricule 123456',
      ]) {
        await post(
          `/messaging/threads/${id}/messages`,
          { texte: ok },
          w.ngoma.token,
        ).expect(201);
      }
    });

    it('le seuil est un paramètre de l’école, et 0 désactive le contrôle', async () => {
      const w = await world();
      const id = await threadWithNgoma(w);
      await prisma.school.updateMany({ data: { messageNumeroMinChiffres: 0 } });
      await post(
        `/portal/messages/threads/${id}/messages`,
        { texte: '06 12 34 56 78' },
        w.pMoukala,
      ).expect(201);
      await prisma.school.updateMany({ data: { messageNumeroMinChiffres: 6 } });
      await post(
        `/portal/messages/threads/${id}/messages`,
        { texte: 'Code 123456' },
        w.pMoukala,
      ).expect(422);
    });

    it('aucune réponse de l’API ne contient un téléphone ni une adresse e-mail', async () => {
      const w = await world();
      const id = await threadWithNgoma(w);
      await post(
        `/messaging/threads/${id}/messages`,
        { texte: 'Bien reçu.' },
        w.ngoma.token,
      ).expect(201);
      const own = await post(
        '/messaging/announcements',
        { classId: w.klassA.id, titre: 'Sortie', corps: 'Sortie vendredi.' },
        w.ngoma.token,
      ).expect(201);
      const responses = [
        (
          await get(
            `/portal/messages/contacts?studentId=${w.alice.id}`,
            w.pMoukala,
          )
        ).body,
        (await get('/portal/messages/threads', w.pMoukala)).body,
        (await get(`/portal/messages/threads/${id}`, w.pMoukala)).body,
        (await get('/portal/announcements', w.pMoukala)).body,
        (await get('/messaging/classes', w.ngoma.token)).body,
        (
          await get(
            `/messaging/recipients?classId=${w.klassA.id}`,
            w.ngoma.token,
          )
        ).body,
        (await get('/messaging/threads', w.ngoma.token)).body,
        (await get(`/messaging/threads/${id}`, w.ngoma.token)).body,
        (await get('/messaging/announcements', w.ngoma.token)).body,
        (await get('/messaging/supervision/threads', w.dir.token)).body,
        (await get(`/messaging/supervision/threads/${id}`, w.dir.token)).body,
        (await get('/messaging/supervision/reports', w.dir.token)).body,
        own.body,
      ];
      const all = JSON.stringify(responses);
      expect(all).not.toMatch(
        /242060000001|060000001|242060000002|242060000003|111 22 33|111.22.33|@exemple\.test|@test\.local/,
      );
      expect(all).not.toMatch(/telephone|email/i);
    });
  });

  // =============================================================================== Supervision

  describe('supervision par la Direction, journalisée (D73, RV11)', () => {
    it('la liste ne montre que des repères, jamais le texte des messages', async () => {
      const w = await world();
      await threadWithNgoma(w);
      const list = (
        await get('/messaging/supervision/threads', w.dir.token).expect(200)
      ).body;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        enfant: 'Alice Moukala',
        responsable: 'Jean Moukala',
        interlocuteur: 'Paul Ngoma',
        nombreMessages: 1,
      });
      expect(JSON.stringify(list)).not.toContain('devoirs');
      const found = (
        await get(
          '/messaging/supervision/threads?search=alice',
          w.dir.token,
        ).expect(200)
      ).body;
      expect(found).toHaveLength(1);
      expect(
        (
          await get(
            '/messaging/supervision/threads?search=zzz',
            w.dir.token,
          ).expect(200)
        ).body,
      ).toHaveLength(0);
    });

    it('chaque lecture d’une conversation par la Direction est journalisée, sans le texte du message', async () => {
      const w = await world();
      const id = await threadWithNgoma(w);
      const before = await prisma.auditLog.count({
        where: { action: 'MESSAGE_SUPERVISED_READ' },
      });
      const read = await get(
        `/messaging/supervision/threads/${id}`,
        w.dir.token,
      ).expect(200);
      expect(read.body.messages[0].texte).toContain('devoirs');
      await get(`/messaging/supervision/threads/${id}`, w.dir.token).expect(
        200,
      );
      const logs = await prisma.auditLog.findMany({
        where: { action: 'MESSAGE_SUPERVISED_READ' },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.length - before).toBe(2);
      expect(
        logs.every((l) => l.userId === w.dir.id && l.entiteId === id),
      ).toBe(true);
      expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain(
        'devoirs',
      );
      await get('/messaging/supervision/threads/inconnue', w.dir.token).expect(
        404,
      );
    });

    it('seule la Direction supervise : ni un enseignant, ni la vie scolaire, ni l’administrateur, ni un parent', async () => {
      const w = await world();
      const id = await threadWithNgoma(w);
      for (const t of [w.ngoma.token, w.surv.token, w.cpt.token, admin]) {
        await get('/messaging/supervision/threads', t).expect(403);
        await get(`/messaging/supervision/threads/${id}`, t).expect(403);
        await get('/messaging/supervision/reports', t).expect(403);
      }
      await get(`/messaging/supervision/threads/${id}`, w.pMoukala).expect(401);
      expect(
        await prisma.auditLog.count({
          where: { action: 'MESSAGE_SUPERVISED_READ' },
        }),
      ).toBe(0);
    });
  });

  describe('signalement et retrait modéré (D75)', () => {
    async function withReply(w: World) {
      const id = await threadWithNgoma(w);
      const reply = (
        await post(
          `/messaging/threads/${id}/messages`,
          { texte: 'Propos déplacé de l’enseignant.' },
          w.ngoma.token,
        ).expect(201)
      ).body;
      const messages = (
        await get(`/portal/messages/threads/${id}`, w.pMoukala).expect(200)
      ).body.messages;
      return {
        id,
        reply,
        fromStaff: messages.find((m: { moi: boolean }) => !m.moi),
        mine: messages.find((m: { moi: boolean }) => m.moi),
      };
    }

    it('un responsable signale un message reçu, une seule fois, mais pas le sien', async () => {
      const w = await world();
      const { fromStaff, mine } = await withReply(w);
      await post(
        `/portal/messages/messages/${mine.id}/report`,
        {},
        w.pMoukala,
      ).expect(422);
      const first = await post(
        `/portal/messages/messages/${fromStaff.id}/report`,
        { motif: 'Ton inapproprié' },
        w.pMoukala,
      ).expect(201);
      expect(first.body.dejaSignale).toBe(false);
      expect(
        (
          await post(
            `/portal/messages/messages/${fromStaff.id}/report`,
            {},
            w.pMoukala,
          ).expect(201)
        ).body.dejaSignale,
      ).toBe(true);
      expect(await prisma.messageReport.count()).toBe(1);
      await post(
        `/portal/messages/messages/${fromStaff.id}/report`,
        {},
        w.pZola,
      ).expect(404); // pas sa conversation
      const audit = JSON.stringify(
        await prisma.auditLog.findMany({ where: { action: 'MESSAGE_REPORT' } }),
      );
      expect(audit).not.toContain('Propos déplacé');
    });

    it('un enseignant peut signaler le message d’un responsable', async () => {
      const w = await world();
      const { id, mine } = await withReply(w);
      await post(
        `/messaging/messages/${mine.id}/report`,
        { motif: 'Insultes' },
        w.ngoma.token,
      ).expect(201);
      await post(
        `/messaging/messages/${mine.id}/report`,
        {},
        w.okemba.token,
      ).expect(404);
      const reports = (
        await get('/messaging/supervision/reports', w.dir.token).expect(200)
      ).body;
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({
        motif: 'Insultes',
        conversationId: id,
        messageDe: 'PARENT',
      });
      expect(JSON.stringify(reports)).not.toContain('devoirs'); // le texte ne s'ouvre que depuis la conversation, journalisée
    });

    it('la Direction traite un signalement', async () => {
      const w = await world();
      const { fromStaff } = await withReply(w);
      await post(
        `/portal/messages/messages/${fromStaff.id}/report`,
        {},
        w.pMoukala,
      ).expect(201);
      const [report] = (
        await get('/messaging/supervision/reports', w.dir.token).expect(200)
      ).body;
      await post(
        `/messaging/supervision/reports/${report.id}/resolve`,
        {},
        w.ngoma.token,
      ).expect(403);
      await post(
        `/messaging/supervision/reports/${report.id}/resolve`,
        {},
        w.dir.token,
      ).expect(201);
      await post(
        `/messaging/supervision/reports/${report.id}/resolve`,
        {},
        w.dir.token,
      ).expect(409);
      expect(
        (await get('/messaging/supervision/reports', w.dir.token).expect(200))
          .body,
      ).toHaveLength(0);
      expect(
        await prisma.auditLog.count({
          where: { action: 'MESSAGE_REPORT_RESOLVE' },
        }),
      ).toBe(1);
    });

    it('le retrait n’efface rien : les participants ne lisent plus le message, la Direction le voit avec le motif', async () => {
      const w = await world();
      const { id, fromStaff } = await withReply(w);
      await post(
        `/messaging/supervision/messages/${fromStaff.id}/withdraw`,
        {},
        w.dir.token,
      ).expect(400); // motif obligatoire
      await post(
        `/messaging/supervision/messages/${fromStaff.id}/withdraw`,
        { motif: 'Propos inappropriés' },
        w.ngoma.token,
      ).expect(403);
      await post(
        `/messaging/supervision/messages/${fromStaff.id}/withdraw`,
        { motif: 'Propos inappropriés' },
        w.dir.token,
      ).expect(201);
      await post(
        `/messaging/supervision/messages/${fromStaff.id}/withdraw`,
        { motif: 'encore' },
        w.dir.token,
      ).expect(409);

      const parentView = (
        await get(`/portal/messages/threads/${id}`, w.pMoukala).expect(200)
      ).body.messages;
      const gone = parentView.find(
        (m: { id: string }) => m.id === fromStaff.id,
      );
      expect(gone).toMatchObject({ texte: null, retire: true });
      expect(JSON.stringify(parentView)).not.toContain('Propos déplacé');
      const staffView = (
        await get(`/messaging/threads/${id}`, w.ngoma.token).expect(200)
      ).body.messages;
      expect(
        staffView.find((m: { id: string }) => m.id === fromStaff.id),
      ).toMatchObject({ texte: null, retire: true });
      expect(
        (await get('/portal/messages/threads', w.pMoukala).expect(200)).body
          .threads[0].dernierMessage.apercu,
      ).toBeNull();

      const supervised = (
        await get(`/messaging/supervision/threads/${id}`, w.dir.token).expect(
          200,
        )
      ).body.messages;
      const original = supervised.find(
        (m: { id: string }) => m.id === fromStaff.id,
      );
      expect(original.texte).toContain('Propos déplacé');
      expect(original.retire.motif).toBe('Propos inappropriés');
      expect(await prisma.message.count({ where: { id: fromStaff.id } })).toBe(
        1,
      ); // jamais supprimé
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'MESSAGE_WITHDRAW' },
      });
      expect(log.userId).toBe(w.dir.id);
      expect(JSON.stringify(log)).not.toContain('Propos déplacé');
    });
  });

  // =============================================================================== Notifications

  describe('notification d’un nouveau message (RV10, D71)', () => {
    // Un appareil par parent : un même appareil enregistré pour deux comptes suit le dernier connecté.
    async function subscribe(t: string) {
      const endpoint = `https://push.example.test/dev-${t.slice(-12)}`;
      await post(
        '/portal/push/subscriptions',
        { endpoint, keys: { p256dh: 'a', auth: 'b' } },
        t,
      ).expect(201);
    }
    const listOf = async (t: string) =>
      (await get('/portal/notifications', t).expect(200)).body
        .notifications as Array<{
        type: string;
        corps: string;
        occurrences: number;
        enfant: { prenom: string };
      }>;

    it('le responsable est prévenu sans le contenu, et lui seul (pas l’autre responsable de l’enfant)', async () => {
      const w = await world();
      await subscribe(w.pMoukala);
      await subscribe(w.pNdinga);
      await post(
        '/messaging/threads',
        {
          studentId: w.brice.id,
          guardianId: w.moukala.id,
          texte: 'Brice a oublié son cahier secret.',
        },
        w.ngoma.token,
      ).expect(201);
      await notifications.idle();
      const mine = await listOf(w.pMoukala);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        type: 'MESSAGE_RECU',
        enfant: { prenom: 'Brice' },
      });
      expect(mine[0].corps).toContain('Paul Ngoma');
      expect(mine[0].corps).not.toContain('cahier');
      expect(await listOf(w.pNdinga)).toHaveLength(0);
      expect(push.sent).toHaveLength(1);
      expect(push.sent[0].payload.body).toContain('nouveau message');
      expect(JSON.stringify(push.sent[0].payload)).not.toMatch(
        /cahier|secret|Ngoma|ngoma/,
      );
    });

    it('plusieurs messages le même jour ne font qu’une notification et une alerte', async () => {
      const w = await world();
      await subscribe(w.pMoukala);
      const id = await threadWithNgoma(w);
      await post(
        `/messaging/threads/${id}/messages`,
        { texte: 'Un.' },
        w.ngoma.token,
      ).expect(201);
      await post(
        `/messaging/threads/${id}/messages`,
        { texte: 'Deux.' },
        w.ngoma.token,
      ).expect(201);
      await notifications.idle();
      const list = await listOf(w.pMoukala);
      expect(list).toHaveLength(1);
      expect(list[0].occurrences).toBe(2);
      expect(push.sent).toHaveLength(1);
    });

    it('une panne du mécanisme de notification ne bloque pas l’envoi du message', async () => {
      const w = await world();
      const id = await threadWithNgoma(w);
      jest
        .spyOn(
          notifications as unknown as { deliver: () => Promise<void> },
          'deliver',
        )
        .mockRejectedValue(new Error('panne'));
      await post(
        `/messaging/threads/${id}/messages`,
        { texte: 'Malgré la panne.' },
        w.ngoma.token,
      ).expect(201);
      expect(await prisma.message.count()).toBe(2);
    });

    it('les compteurs de non lus suivent la lecture de chaque côté', async () => {
      const w = await world();
      const id = await threadWithNgoma(w); // message de la mère
      expect(
        (await get('/messaging/unread-count', w.ngoma.token).expect(200)).body
          .nonLus,
      ).toBe(1);
      await get(`/messaging/threads/${id}`, w.ngoma.token).expect(200);
      expect(
        (await get('/messaging/unread-count', w.ngoma.token).expect(200)).body
          .nonLus,
      ).toBe(0);
      await post(
        `/messaging/threads/${id}/messages`,
        { texte: 'Bien reçu.' },
        w.ngoma.token,
      ).expect(201);
      expect(
        (await get('/portal/messages/unread-count', w.pMoukala).expect(200))
          .body.nonLus,
      ).toBe(1);
      const threads = (
        await get('/portal/messages/threads', w.pMoukala).expect(200)
      ).body;
      expect(threads.threads[0].nonLus).toBe(1);
      expect(threads.delaiReponseJours).toBe(2);
      await get(`/portal/messages/threads/${id}`, w.pMoukala).expect(200);
      expect(
        (await get('/portal/messages/unread-count', w.pMoukala).expect(200))
          .body.nonLus,
      ).toBe(0);
    });

    it('le délai de réponse indicatif est un paramètre de l’école', async () => {
      const w = await world();
      await prisma.school.updateMany({ data: { messageDelaiReponseJours: 5 } });
      expect(
        (await get('/portal/messages/threads', w.pMoukala).expect(200)).body
          .delaiReponseJours,
      ).toBe(5);
    });
  });

  // ==================================================================================== Annonces

  describe('annonces de classe', () => {
    it('un enseignant publie pour sa classe, les responsables de cette classe seulement la voient et sont prévenus', async () => {
      const w = await world();
      await post(
        '/portal/push/subscriptions',
        {
          endpoint: 'https://push.example.test/dev-2',
          keys: { p256dh: 'a', auth: 'b' },
        },
        w.pMoukala,
      ).expect(201);
      const res = await post(
        '/messaging/announcements',
        {
          classId: w.klassA.id,
          titre: 'Sortie au musée',
          corps: 'Prévoir un pique-nique.',
        },
        w.ngoma.token,
      ).expect(201);
      await notifications.idle();

      const seen = (await get('/portal/announcements', w.pMoukala).expect(200))
        .body;
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        titre: 'Sortie au musée',
        classe: 'CM2 A',
        enfants: ['Alice', 'Brice'],
      });
      expect(
        (await get('/portal/announcements', w.pNdinga).expect(200)).body,
      ).toHaveLength(1);
      expect(
        (await get('/portal/announcements', w.pZola).expect(200)).body,
      ).toHaveLength(0);

      const notif = (
        await get('/portal/notifications', w.pMoukala).expect(200)
      ).body.notifications.filter(
        (n: { type: string }) => n.type === 'ANNONCE',
      );
      expect(notif).toHaveLength(2); // une par enfant de la classe
      expect(
        (await get('/portal/notifications', w.pZola).expect(200)).body
          .notifications,
      ).toHaveLength(0);
      expect(push.sent).toHaveLength(1);
      expect(JSON.stringify(push.sent[0].payload)).not.toMatch(
        /musée|pique-nique/,
      );
      expect(res.body.id).toBeDefined();
    });

    it('un enseignant ne publie que pour ses classes, la vie scolaire pour toutes', async () => {
      const w = await world();
      const body = { titre: 'Info', corps: 'Texte.' };
      await post(
        '/messaging/announcements',
        { classId: w.klassB.id, ...body },
        w.ngoma.token,
      ).expect(403);
      await post(
        '/messaging/announcements',
        { classId: w.klassA.id, ...body },
        w.bello.token,
      ).expect(403);
      await post(
        '/messaging/announcements',
        { classId: w.klassB.id, ...body },
        w.surv.token,
      ).expect(201);
      await post(
        '/messaging/announcements',
        { classId: w.klassB.id, ...body },
        w.cpt.token,
      ).expect(403);
      await post(
        '/messaging/announcements',
        { classId: 'inconnue', ...body },
        w.surv.token,
      ).expect(404);
      await post(
        '/messaging/announcements',
        { classId: w.klassA.id, titre: '', corps: 'x' },
        w.ngoma.token,
      ).expect(400);
      expect(
        (await get('/portal/announcements', w.pZola).expect(200)).body,
      ).toHaveLength(1);
    });

    it('l’auteur ou la Direction retire une annonce avec un motif : elle disparaît chez les parents, la trace reste', async () => {
      const w = await world();
      const id = (
        await post(
          '/messaging/announcements',
          { classId: w.klassA.id, titre: 'Erreur', corps: 'Date fausse.' },
          w.ngoma.token,
        ).expect(201)
      ).body.id;
      await post(
        `/messaging/announcements/${id}/withdraw`,
        { motif: 'Date fausse' },
        w.okemba.token,
      ).expect(403);
      await post(
        `/messaging/announcements/${id}/withdraw`,
        {},
        w.ngoma.token,
      ).expect(400);
      await post(
        `/messaging/announcements/${id}/withdraw`,
        { motif: 'Date fausse' },
        w.ngoma.token,
      ).expect(201);
      await post(
        `/messaging/announcements/${id}/withdraw`,
        { motif: 'encore' },
        w.dir.token,
      ).expect(409);
      expect(
        (await get('/portal/announcements', w.pMoukala).expect(200)).body,
      ).toHaveLength(0);
      const mine = (
        await get('/messaging/announcements', w.ngoma.token).expect(200)
      ).body;
      expect(mine[0].retire.motif).toBe('Date fausse');
      expect(await prisma.announcement.count()).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: { action: 'ANNOUNCEMENT_WITHDRAW' },
        }),
      ).toBe(1);

      const other = (
        await post(
          '/messaging/announcements',
          { classId: w.klassA.id, titre: 'Autre', corps: 'Texte.' },
          w.ngoma.token,
        ).expect(201)
      ).body.id;
      await post(
        `/messaging/announcements/${other}/withdraw`,
        { motif: 'Hors sujet' },
        w.dir.token,
      ).expect(201);
    });

    it('un enseignant ne voit que les annonces de ses classes', async () => {
      const w = await world();
      await post(
        '/messaging/announcements',
        { classId: w.klassA.id, titre: 'A', corps: 'x' },
        w.surv.token,
      ).expect(201);
      await post(
        '/messaging/announcements',
        { classId: w.klassB.id, titre: 'B', corps: 'x' },
        w.surv.token,
      ).expect(201);
      expect(
        (
          await get('/messaging/announcements', w.ngoma.token).expect(200)
        ).body.map((a: { titre: string }) => a.titre),
      ).toEqual(['A']);
      await get(
        `/messaging/announcements?classId=${w.klassB.id}`,
        w.ngoma.token,
      ).expect(403);
      expect(
        (await get('/messaging/announcements', w.surv.token).expect(200)).body,
      ).toHaveLength(2);
    });
  });
});

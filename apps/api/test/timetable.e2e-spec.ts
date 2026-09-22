import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

/** Lot 8 : emploi du temps (addendum v1.1, RV01 à RV03). Lundi 2026-09-07, année du 2026-09-01 au 2027-07-15. */
describe('Emploi du temps (e2e, Lot 8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    token = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
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

  const get = (path: string, t?: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${t ?? token}`);
  const post = (path: string, body: object, t?: string) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t ?? token}`)
      .send(body);
  const patch = (path: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const put = (path: string, body: object) =>
    request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const del = (path: string) =>
    request(app.getHttpServer())
      .delete(path)
      .set('Authorization', `Bearer ${token}`);

  /** Une école complète : 2 classes, 2 matières, 2 enseignants, 2 salles, 3 créneaux de cours + 1 pause. */
  async function school() {
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
        dateDebut: '2026-09-01',
        dateFin: '2027-07-15',
      })
    ).body;
    const classA = (
      await post('/classes', {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 A',
      })
    ).body;
    const classB = (
      await post('/classes', {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 B',
      })
    ).body;

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
        heureDebut: '08:50',
        heureFin: '09:40',
      })
    ).body;
    const pause = (
      await post('/time-slots', {
        libelle: 'Récréation',
        heureDebut: '09:40',
        heureFin: '10:00',
        type: 'PAUSE',
      })
    ).body;
    const h3 = (
      await post('/time-slots', {
        libelle: 'H3',
        heureDebut: '10:00',
        heureFin: '10:50',
      })
    ).body;

    const math = (
      await post('/subjects', { code: 'MATH', nom: 'Mathématiques' })
    ).body;
    const fr = (await post('/subjects', { code: 'FR', nom: 'Français' })).body;
    for (const s of [math, fr]) {
      await put(`/subjects/${s.id}/levels`, {
        levels: [{ levelId: level.id }],
      }).expect(200);
    }
    const t1 = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
    const t2 = (await post('/teachers', { nom: 'Mabiala', prenom: 'Claire' }))
      .body;
    const t3 = (await post('/teachers', { nom: 'Okemba', prenom: 'Jean' }))
      .body;

    const asg = async (classId: string, subjectId: string, teacherId: string) =>
      (await post('/assignments', { classId, subjectId, teacherId })).body;
    await asg(classA.id, math.id, t1.id);
    await asg(classA.id, fr.id, t2.id);
    await asg(classB.id, math.id, t1.id);
    await asg(classB.id, fr.id, t2.id);

    const r1 = (await post('/rooms', { nom: 'Salle 1' })).body;
    const r2 = (await post('/rooms', { nom: 'Salle 2' })).body;
    return {
      year,
      level,
      classA,
      classB,
      h1,
      h2,
      h3,
      pause,
      math,
      fr,
      t1,
      t2,
      t3,
      r1,
      r2,
    };
  }

  async function draft(yearId: string, extra: object = {}) {
    return (
      await post('/timetables', { academicYearId: yearId, ...extra }).expect(
        201,
      )
    ).body;
  }

  const entry = (
    tt: string,
    d: {
      classA?: boolean;
      classId: string;
      subjectId: string;
      timeSlotId: string;
      jourSemaine: number;
      roomId: string;
    },
  ) => post(`/timetables/${tt}/entries`, d);

  describe('permissions', () => {
    it('sans jeton : 401 ; le Secrétaire-caissier lit mais n’écrit pas ; les brouillons lui sont cachés', async () => {
      const s = await school();
      await request(app.getHttpServer()).get('/timetables').expect(401);

      const tt = await draft(s.year.id);
      const sch = await prisma.school.findFirstOrThrow();
      const { user, motDePasse } = await createUserWithRole(
        prisma,
        sch.id,
        'SECRETAIRE_CAISSIER',
      );
      const t = await login(user.email, motDePasse);

      await post('/timetables', { academicYearId: s.year.id }, t).expect(403);
      await post(
        `/timetables/${tt.id}/publish`,
        { dateEffet: '2026-09-07' },
        t,
      ).expect(403);
      const list = await get('/timetables', t).expect(200);
      expect(list.body).toEqual([]);
      await get(`/timetables/${tt.id}`, t).expect(404);
      await get(`/timetables/${tt.id}/entries`, t).expect(404);
      await get('/timetable/week?date=2026-09-07', t).expect(200);
    });
  });

  describe('séances et conflits (RV02)', () => {
    it('crée une séance : enseignant déduit de l’affectation, heures du créneau', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      const res = await entry(tt.id, {
        classId: s.classA.id,
        subjectId: s.math.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r1.id,
      }).expect(201);
      expect(res.body.teacherId).toBe(s.t1.id);
      expect(res.body.heureDebut).toBe('08:00');
      expect(res.body.heureFin).toBe('08:50');
    });

    it('refuse un conflit de classe, d’enseignant et de salle, en nommant la séance en cause', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        subjectId: s.math.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r1.id,
      }).expect(201);

      // Même classe, même créneau (autre matière, autre salle).
      const classe = await entry(tt.id, {
        classId: s.classA.id,
        subjectId: s.fr.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r2.id,
      }).expect(409);
      expect(classe.body.message).toContain('Cette classe a déjà cours');
      expect(classe.body.message).toContain('CM2 A');

      // Même enseignant (Ngoma enseigne les maths aux deux classes), autre classe, autre salle.
      const teacher = await entry(tt.id, {
        classId: s.classB.id,
        subjectId: s.math.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r2.id,
      }).expect(409);
      expect(teacher.body.message).toContain('Paul Ngoma');

      // Même salle, autre classe, autre enseignant.
      const room = await entry(tt.id, {
        classId: s.classB.id,
        subjectId: s.fr.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r1.id,
      }).expect(409);
      expect(room.body.message).toContain('Salle 1');
    });

    it('autorise deux séances qui s’enchaînent, ou le même créneau un autre jour', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      const base = {
        classId: s.classA.id,
        subjectId: s.math.id,
        roomId: s.r1.id,
      };
      await entry(tt.id, {
        ...base,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
      }).expect(201);
      await entry(tt.id, {
        ...base,
        timeSlotId: s.h2.id,
        jourSemaine: 1,
      }).expect(201);
      await entry(tt.id, {
        ...base,
        timeSlotId: s.h1.id,
        jourSemaine: 2,
      }).expect(201);
    });

    it('vérifie l’affectation, le créneau (cours, grille), le jour de classe, la salle et l’enseignant actif', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      const ok = {
        classId: s.classA.id,
        subjectId: s.math.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r1.id,
      };

      const other = (await post('/subjects', { code: 'ART', nom: 'Dessin' }))
        .body;
      await entry(tt.id, { ...ok, subjectId: other.id }).expect(422); // pas d'affectation
      await entry(tt.id, { ...ok, timeSlotId: s.pause.id }).expect(422); // pause
      await entry(tt.id, { ...ok, jourSemaine: 6 }).expect(422); // samedi pas jour de classe
      await entry(tt.id, { ...ok, jourSemaine: 7 }).expect(400);
      await entry(tt.id, { ...ok, roomId: 'inconnue' }).expect(404);

      await patch(`/rooms/${s.r1.id}`, { actif: false }).expect(200);
      await entry(tt.id, ok).expect(409); // salle désactivée
      await patch(`/rooms/${s.r1.id}`, { actif: true }).expect(200);

      await patch(`/teachers/${s.t1.id}`, { statut: 'INACTIF' }).expect(200);
      await entry(tt.id, ok).expect(409); // enseignant inactif
    });

    it('modifie et supprime une séance de brouillon, avec re-contrôle des conflits', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      const a = (
        await entry(tt.id, {
          classId: s.classA.id,
          subjectId: s.math.id,
          timeSlotId: s.h1.id,
          jourSemaine: 1,
          roomId: s.r1.id,
        }).expect(201)
      ).body;
      await entry(tt.id, {
        classId: s.classB.id,
        subjectId: s.fr.id,
        timeSlotId: s.h2.id,
        jourSemaine: 1,
        roomId: s.r2.id,
      }).expect(201);

      const moved = await patch(`/timetable-entries/${a.id}`, {
        timeSlotId: s.h3.id,
      }).expect(200);
      expect(moved.body.heureDebut).toBe('10:00');
      await patch(`/timetable-entries/${a.id}`, {
        roomId: s.r2.id,
        timeSlotId: s.h2.id,
      }).expect(409);

      await del(`/timetable-entries/${a.id}`).expect(200);
      const list = await get(`/timetables/${tt.id}/entries`).expect(200);
      expect(list.body).toHaveLength(1);
    });
  });

  describe('versions et publication (RV03)', () => {
    async function filled() {
      const s = await school();
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        subjectId: s.math.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r1.id,
      }).expect(201);
      return { s, tt };
    }

    it('refuse de publier un emploi du temps vide ou hors de l’année', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-09-07',
      }).expect(422);

      await entry(tt.id, {
        classId: s.classA.id,
        subjectId: s.math.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r1.id,
      }).expect(201);
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-08-01',
      }).expect(422);
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2027-09-01',
      }).expect(422);
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: 'demain',
      }).expect(400);
    });

    it('publie, puis la version est figée', async () => {
      const { s, tt } = await filled();
      const res = await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-09-07',
      }).expect(201);
      expect(res.body.statut).toBe('PUBLIE');
      expect(res.body.dateEffet).toContain('2026-09-07');

      const e = (await get(`/timetables/${tt.id}/entries`).expect(200)).body[0];
      await patch(`/timetable-entries/${e.id}`, { jourSemaine: 2 }).expect(409);
      await del(`/timetable-entries/${e.id}`).expect(409);
      await entry(tt.id, {
        classId: s.classB.id,
        subjectId: s.fr.id,
        timeSlotId: s.h2.id,
        jourSemaine: 1,
        roomId: s.r2.id,
      }).expect(409);
      await del(`/timetables/${tt.id}`).expect(409);
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-09-14',
      }).expect(409);
    });

    it('bloque la publication quand un conflit existe (créé après coup par une affectation modifiée)', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        subjectId: s.math.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r1.id,
      }).expect(201);
      await entry(tt.id, {
        classId: s.classB.id,
        subjectId: s.fr.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r2.id,
      }).expect(201);

      // CM2 B / Français passe à Ngoma, déjà en classe CM2 A au même moment.
      const asg = (
        await get(`/assignments?classId=${s.classB.id}`).expect(200)
      ).body.find((a: { subjectId: string }) => a.subjectId === s.fr.id);
      await patch(`/assignments/${asg.id}`, { teacherId: s.t1.id }).expect(200);

      const check = await get(`/timetables/${tt.id}/check`).expect(200);
      expect(check.body.pret).toBe(false);
      expect(check.body.problemes.join(' ')).toContain('a changé');

      const res = await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-09-07',
      }).expect(422);
      expect(res.body.message).toContain('Publication impossible');

      // La mise à jour des enseignants détecte le conflit et n'écrase rien.
      const sync = await post(`/timetables/${tt.id}/resync`, {}).expect(201);
      expect(sync.body.misAJour).toBe(0);
      expect(sync.body.problemes.join(' ')).toContain('Paul Ngoma');
    });

    it('versionne : nouvelle version copiée de la publiée, archivage de la précédente, un seul brouillon', async () => {
      const { s, tt } = await filled();
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-09-07',
      }).expect(201);

      const v2 = await draft(s.year.id);
      expect(v2.numero).toBe(2);
      const copied = await get(`/timetables/${v2.id}/entries`).expect(200);
      expect(copied.body).toHaveLength(1);
      await post('/timetables', { academicYearId: s.year.id }).expect(409); // déjà un brouillon

      // Modifier le brouillon ne touche pas la version publiée.
      await entry(v2.id, {
        classId: s.classB.id,
        subjectId: s.fr.id,
        timeSlotId: s.h2.id,
        jourSemaine: 1,
        roomId: s.r2.id,
      }).expect(201);
      expect(
        (await get(`/timetables/${tt.id}/entries`).expect(200)).body,
      ).toHaveLength(1);

      // La date d'effet doit suivre celle de la version en vigueur.
      await post(`/timetables/${v2.id}/publish`, {
        dateEffet: '2026-09-07',
      }).expect(422);
      await post(`/timetables/${v2.id}/publish`, {
        dateEffet: '2026-10-05',
      }).expect(201);

      const list = (
        await get(`/timetables?academicYearId=${s.year.id}`).expect(200)
      ).body;
      expect(
        list.map((t: { numero: number; statut: string }) => [
          t.numero,
          t.statut,
        ]),
      ).toEqual([
        [2, 'PUBLIE'],
        [1, 'ARCHIVE'],
      ]);
    });

    it('permet de repartir d’un emploi du temps vide, et de supprimer un brouillon', async () => {
      const { s, tt } = await filled();
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-09-07',
      }).expect(201);
      const v2 = await draft(s.year.id, { vide: true });
      expect(
        (await get(`/timetables/${v2.id}/entries`).expect(200)).body,
      ).toHaveLength(0);
      await del(`/timetables/${v2.id}`).expect(200);
      await get(`/timetables/${v2.id}`).expect(404);
    });

    it('applique la version en vigueur à chaque date (avant, pendant, après la date d’effet)', async () => {
      const { s, tt } = await filled();
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-09-14',
      }).expect(201);
      const v2 = await draft(s.year.id, { vide: true });
      await entry(v2.id, {
        classId: s.classA.id,
        subjectId: s.fr.id,
        timeSlotId: s.h2.id,
        jourSemaine: 1,
        roomId: s.r2.id,
      }).expect(201);
      await post(`/timetables/${v2.id}/publish`, {
        dateEffet: '2026-10-05',
      }).expect(201);

      const day = async (d: string) =>
        (await get(`/timetable/day?date=${d}`).expect(200)).body;
      expect((await day('2026-09-07')).seances).toHaveLength(0); // avant toute version
      const d1 = await day('2026-09-21');
      expect(d1.version.numero).toBe(1);
      expect(d1.seances[0].subjectName).toBe('Mathématiques');
      const d2 = await day('2026-10-12');
      expect(d2.version.numero).toBe(2);
      expect(d2.seances[0].subjectName).toBe('Français');
    });
  });

  describe('changements ponctuels', () => {
    async function published() {
      const s = await school();
      const tt = await draft(s.year.id);
      const e1 = (
        await entry(tt.id, {
          classId: s.classA.id,
          subjectId: s.math.id,
          timeSlotId: s.h1.id,
          jourSemaine: 1,
          roomId: s.r1.id,
        }).expect(201)
      ).body;
      const e2 = (
        await entry(tt.id, {
          classId: s.classB.id,
          subjectId: s.fr.id,
          timeSlotId: s.h1.id,
          jourSemaine: 1,
          roomId: s.r2.id,
        }).expect(201)
      ).body;
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-09-07',
      }).expect(201);
      return { s, tt, e1, e2 };
    }
    const exc = (entryId: string, body: object) =>
      post(`/timetable-entries/${entryId}/exceptions`, body);

    it('annule une séance sans modifier la version publiée (l’historique reste intact)', async () => {
      const { s, tt, e1 } = await published();
      await exc(e1.id, {
        date: '2026-09-14',
        type: 'ANNULEE',
        motif: 'Enseignant absent',
      }).expect(201);

      const day = (await get('/timetable/day?date=2026-09-14').expect(200))
        .body;
      const cancelled = day.seances.find(
        (x: { entryId: string }) => x.entryId === e1.id,
      );
      expect(cancelled.statut).toBe('ANNULEE');
      expect(cancelled.exception.motif).toBe('Enseignant absent');
      // Les autres lundis sont normaux.
      const other = (await get('/timetable/day?date=2026-09-21').expect(200))
        .body;
      expect(
        other.seances.every((x: { statut: string }) => x.statut === 'NORMALE'),
      ).toBe(true);

      // La version publiée n'a pas bougé : mêmes séances, même statut, mêmes enseignants.
      const stored = (await get(`/timetables/${tt.id}/entries`).expect(200))
        .body;
      expect(stored).toHaveLength(2);
      expect(stored.find((x: { id: string }) => x.id === e1.id).teacherId).toBe(
        s.t1.id,
      );
      expect((await get(`/timetables/${tt.id}`).expect(200)).body.statut).toBe(
        'PUBLIE',
      );
    });

    it('remplace l’enseignant, avec contrôle de disponibilité du remplaçant', async () => {
      const { s, e1 } = await published();
      // Mabiala enseigne déjà à ce moment (CM2 B).
      const busy = await exc(e1.id, {
        date: '2026-09-14',
        type: 'REMPLACEE',
        motif: 'Absence',
        replacementTeacherId: s.t2.id,
      }).expect(409);
      expect(busy.body.message).toContain('Claire Mabiala');
      await exc(e1.id, {
        date: '2026-09-14',
        type: 'REMPLACEE',
        motif: 'Absence',
      }).expect(422);
      await exc(e1.id, {
        date: '2026-09-14',
        type: 'REMPLACEE',
        motif: 'Absence',
        replacementTeacherId: s.t1.id,
      }).expect(422);

      await exc(e1.id, {
        date: '2026-09-14',
        type: 'REMPLACEE',
        motif: 'Absence',
        replacementTeacherId: s.t3.id,
      }).expect(201);
      const day = (
        await get(`/timetable/day?date=2026-09-14&teacherId=${s.t3.id}`).expect(
          200,
        )
      ).body;
      expect(day.seances).toHaveLength(1);
      expect(day.seances[0].statut).toBe('REMPLACEE');
      expect(day.seances[0].exception.enseignantInitial).toBe('Paul Ngoma');
    });

    it('change de salle, avec contrôle d’occupation, et une séance annulée libère sa ressource', async () => {
      const { s, e1, e2 } = await published();
      const busy = await exc(e1.id, {
        date: '2026-09-14',
        type: 'SALLE_MODIFIEE',
        motif: 'Travaux',
        roomId: s.r2.id,
      }).expect(409);
      expect(busy.body.message).toContain('Salle 2');
      await exc(e1.id, {
        date: '2026-09-14',
        type: 'SALLE_MODIFIEE',
        motif: 'Travaux',
      }).expect(422);
      await exc(e1.id, {
        date: '2026-09-14',
        type: 'SALLE_MODIFIEE',
        motif: 'Travaux',
        roomId: s.r1.id,
      }).expect(422);

      // Une fois la séance de CM2 B annulée, sa salle est libre.
      await exc(e2.id, {
        date: '2026-09-14',
        type: 'ANNULEE',
        motif: 'Sortie',
      }).expect(201);
      await exc(e1.id, {
        date: '2026-09-14',
        type: 'SALLE_MODIFIEE',
        motif: 'Travaux',
        roomId: s.r2.id,
      }).expect(201);
      const day = (
        await get(`/timetable/day?date=2026-09-14&roomId=${s.r2.id}`).expect(
          200,
        )
      ).body;
      expect(
        day.seances.map((x: { className: string }) => x.className),
      ).toContain('CM2 A');
    });

    it('applique les règles de date, de doublon et de statut', async () => {
      const { s, tt, e1 } = await published();
      await exc(e1.id, {
        date: '2026-09-15',
        type: 'ANNULEE',
        motif: 'x',
      }).expect(422); // pas un lundi
      await exc(e1.id, {
        date: '2026-08-31',
        type: 'ANNULEE',
        motif: 'x',
      }).expect(422); // avant la date d'effet
      await exc(e1.id, {
        date: '2026-09-14',
        type: 'ANNULEE',
        motif: '',
      }).expect(400);
      await exc(e1.id, {
        date: '2026-09-14',
        type: 'ANNULEE',
        motif: 'x',
      }).expect(201);
      await exc(e1.id, {
        date: '2026-09-14',
        type: 'ANNULEE',
        motif: 'x',
      }).expect(409); // doublon

      // Un jour sans classe (calendrier) n'a pas de séance à modifier.
      await post('/calendar-events', {
        academicYearId: s.year.id,
        type: 'FERIE',
        libelle: 'Fête',
        dateDebut: '2026-09-21',
      }).expect(201);
      await exc(e1.id, {
        date: '2026-09-21',
        type: 'ANNULEE',
        motif: 'x',
      }).expect(422);
      const closed = (await get('/timetable/day?date=2026-09-21').expect(200))
        .body;
      expect(closed.seances).toEqual([]);
      expect(closed.sansClasse.libelle).toBe('Fête');

      // Pas de changement ponctuel sur un brouillon.
      const v2 = await draft(s.year.id);
      const copied = (await get(`/timetables/${v2.id}/entries`).expect(200))
        .body[0];
      await exc(copied.id, {
        date: '2026-09-28',
        type: 'ANNULEE',
        motif: 'x',
      }).expect(409);
      expect(tt.id).toBeDefined();
    });

    it('refuse un changement sur une version remplacée à cette date, et se supprime proprement', async () => {
      const { s, e1 } = await published();
      const v2 = await draft(s.year.id);
      await post(`/timetables/${v2.id}/publish`, {
        dateEffet: '2026-10-05',
      }).expect(201);

      await exc(e1.id, {
        date: '2026-10-12',
        type: 'ANNULEE',
        motif: 'x',
      }).expect(422); // v2 en vigueur
      const created = (
        await exc(e1.id, {
          date: '2026-09-28',
          type: 'ANNULEE',
          motif: 'x',
        }).expect(201)
      ).body;

      const list = (
        await get('/timetable-exceptions?from=2026-09-01&to=2026-09-30').expect(
          200,
        )
      ).body;
      expect(list).toHaveLength(1);
      await del(`/timetable-exceptions/${created.id}`).expect(200);
      expect(
        (await get('/timetable-exceptions').expect(200)).body,
      ).toHaveLength(0);
      await del(`/timetable-exceptions/${created.id}`).expect(404);
    });
  });

  describe('vues (classe, enseignant, salle) et semaine', () => {
    it('filtre la semaine par classe, par enseignant et par salle', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        subjectId: s.math.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r1.id,
      }).expect(201);
      await entry(tt.id, {
        classId: s.classB.id,
        subjectId: s.fr.id,
        timeSlotId: s.h2.id,
        jourSemaine: 3,
        roomId: s.r2.id,
      }).expect(201);
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-09-07',
      }).expect(201);

      const week = async (q: string) =>
        (await get(`/timetable/week?date=2026-09-09${q}`).expect(200)).body;
      const all = await week('');
      expect(all.debut).toBe('2026-09-07');
      expect(all.fin).toBe('2026-09-13');
      expect(all.jours).toHaveLength(7);
      const count = (w: { jours: { seances: unknown[] }[] }) =>
        w.jours.reduce((n, j) => n + j.seances.length, 0);
      expect(count(all)).toBe(2);
      expect(count(await week(`&classId=${s.classA.id}`))).toBe(1);
      expect(count(await week(`&teacherId=${s.t2.id}`))).toBe(1);
      expect(count(await week(`&roomId=${s.r2.id}`))).toBe(1);
      // Samedi et dimanche : jours sans classe.
      expect(all.jours[5].sansClasse).not.toBeNull();
      await get('/timetable/week?date=pas-une-date').expect(400);
    });
  });

  describe('protections du référentiel (Lot 7)', () => {
    it('refuse de changer ou supprimer un créneau, une salle ou une affectation utilisés', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        subjectId: s.math.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r1.id,
      }).expect(201);

      await patch(`/time-slots/${s.h1.id}`, { heureFin: '08:45' }).expect(409);
      await patch(`/time-slots/${s.h1.id}`, {
        libelle: 'Première heure',
      }).expect(200); // libellé libre
      await del(`/time-slots/${s.h1.id}`).expect(409);
      await del(`/rooms/${s.r1.id}`).expect(409);
      const asg = (
        await get(`/assignments?classId=${s.classA.id}`).expect(200)
      ).body.find((a: { subjectId: string }) => a.subjectId === s.math.id);
      await del(`/assignments/${asg.id}`).expect(409);

      // Ce qui n'est pas utilisé reste supprimable.
      await del(`/time-slots/${s.h3.id}`).expect(200);
      await del(`/rooms/${s.r2.id}`).expect(200);
    });
  });

  describe('année clôturée et audit', () => {
    it('trace la création, la publication et les changements ponctuels dans le journal', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      const e = (
        await entry(tt.id, {
          classId: s.classA.id,
          subjectId: s.math.id,
          timeSlotId: s.h1.id,
          jourSemaine: 1,
          roomId: s.r1.id,
        }).expect(201)
      ).body;
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-09-07',
      }).expect(201);
      await post(`/timetable-entries/${e.id}/exceptions`, {
        date: '2026-09-14',
        type: 'ANNULEE',
        motif: 'x',
      }).expect(201);

      const actions = (
        await prisma.auditLog.findMany({ select: { action: true } })
      ).map((a) => a.action);
      for (const a of [
        'TIMETABLE_CREATE',
        'TIMETABLE_ENTRY_CREATE',
        'TIMETABLE_PUBLISH',
        'TIMETABLE_EXCEPTION_CREATE',
      ]) {
        expect(actions).toContain(a);
      }
    });

    it('refuse de créer une version pour une année clôturée', async () => {
      const s = await school();
      await post(`/academic-years/${s.year.id}/activate`, {}).expect(201);
      await post(`/academic-years/${s.year.id}/close`, {}).expect(201);
      await post('/timetables', { academicYearId: s.year.id }).expect(409);
    });
  });
});

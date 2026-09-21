import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays, weekdayOf } from '../src/timetable/timetable.util';

/**
 * Lot 9 : assiduité des élèves (addendum v1.1, RV04, RV05, D57 à D60). Les dates sont relatives à
 * aujourd'hui (fuseau de l'établissement) : tous les jours sont des jours de classe dans ces tests.
 */
describe('Assiduité des élèves (e2e, Lot 9)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const yesterday = addDays(today, -1);
  const lastWeek = addDays(today, -7);

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
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, motDePasse }).expect(201);
    return res.body.accessToken;
  }

  const get = (path: string, t?: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t ?? token}`);
  const post = (path: string, body: object, t?: string) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${t ?? token}`).send(body);
  const patch = (path: string, body: object, t?: string) =>
    request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${t ?? token}`).send(body);
  const put = (path: string, body: object) =>
    request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${token}`).send(body);
  const del = (path: string) => request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${token}`);

  async function userToken(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(prisma, sch.id, roleCode, { email, prenom: roleCode, nom: 'Test' });
    return { user, token: await login(user.email, motDePasse) };
  }

  /** Rôle qui peut faire l'appel mais pas corriger (ce que sera un enseignant). */
  async function takeOnlyToken(email = 'prof@test.local') {
    let role = await prisma.role.findUnique({ where: { code: 'APPEL_SEUL' } });
    if (!role) {
      role = await prisma.role.create({ data: { code: 'APPEL_SEUL', nom: 'Appel seul', description: 'test' } });
      const perms = await prisma.permission.findMany({ where: { code: { in: ['ATTENDANCE_TAKE', 'ATTENDANCE_READ'] } } });
      await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role!.id, permissionId: p.id })) });
    }
    return userToken('APPEL_SEUL', email);
  }

  /**
   * Une classe de trois élèves, un enseignant remplaçant possible, et un emploi du temps publié avec
   * une séance chaque jour utile : aujourd'hui, hier et il y a une semaine (même jour qu'aujourd'hui).
   */
  async function school() {
    await patch('/pedagogy/settings', { joursClasse: [0, 1, 2, 3, 4, 5, 6] }).expect(200);
    const section = (await post('/sections', { code: 'FR', nom: 'Francophone' })).body;
    const cycle = (await post('/cycles', { sectionId: section.id, code: 'PRIM', nom: 'Primaire' })).body;
    const level = (await post('/levels', { cycleId: cycle.id, code: 'CM2', nom: 'CM2' })).body;
    const year = (
      await post('/academic-years', { libelle: '2026-2027', dateDebut: addDays(today, -120), dateFin: addDays(today, 200) })
    ).body;
    const klass = (await post('/classes', { levelId: level.id, academicYearId: year.id, nom: 'CM2 A' })).body;

    const h1 = (await post('/time-slots', { libelle: 'H1', heureDebut: '08:00', heureFin: '08:50' })).body;
    const h2 = (await post('/time-slots', { libelle: 'H2', heureDebut: '09:00', heureFin: '09:50' })).body;
    const math = (await post('/subjects', { code: 'MATH', nom: 'Mathématiques' })).body;
    await put(`/subjects/${math.id}/levels`, { levels: [{ levelId: level.id }] }).expect(200);
    const t1 = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
    const t2 = (await post('/teachers', { nom: 'Okemba', prenom: 'Jean' })).body;
    await post('/assignments', { classId: klass.id, subjectId: math.id, teacherId: t1.id }).expect(201);
    const room = (await post('/rooms', { nom: 'Salle 1' })).body;

    const tt = (await post('/timetables', { academicYearId: year.id }).expect(201)).body;
    const mk = async (timeSlotId: string, jourSemaine: number) =>
      (
        await post(`/timetables/${tt.id}/entries`, {
          classId: klass.id,
          subjectId: math.id,
          timeSlotId,
          jourSemaine,
          roomId: room.id,
        }).expect(201)
      ).body;
    const entryToday = await mk(h1.id, weekdayOf(today)); // 08:00 - 08:50, aussi il y a une semaine
    const entryYesterday = await mk(h2.id, weekdayOf(yesterday)); // 09:00 - 09:50
    await post(`/timetables/${tt.id}/publish`, { dateEffet: addDays(today, -60) }).expect(201);

    const sch = await prisma.school.findFirstOrThrow();
    const mkStudent = async (nom: string, prenom: string, i: number) => {
      const student = await prisma.student.create({
        data: {
          schoolId: sch.id,
          matricule: `M${i}`,
          nom,
          prenom,
          sexe: 'M',
          dateNaissance: new Date('2015-01-01'),
        },
      });
      await prisma.enrollment.create({
        data: {
          schoolId: sch.id,
          studentId: student.id,
          classId: klass.id,
          academicYearId: year.id,
          numero: `INS-${i}`,
          type: 'INSCRIPTION',
        },
      });
      return student;
    };
    const s1 = await mkStudent('Bakala', 'Alice', 1);
    const s2 = await mkStudent('Mouanda', 'Brice', 2);
    const s3 = await mkStudent('Zola', 'Carine', 3);
    return { year, klass, math, t1, t2, room, entryToday, entryYesterday, s1, s2, s3, timetable: tt };
  }

  const call = (
    entryId: string,
    date: string,
    absences: object[] = [],
    extra: object = {},
    t?: string,
  ) => post('/attendance/calls', { entryId, date, absences, ...extra }, t);

  describe('permissions', () => {
    it('sans jeton : 401 ; secrétaire sans accès ; auditeur lit mais ne fait pas l’appel', async () => {
      const s = await school();
      await request(app.getHttpServer()).get(`/attendance/day?date=${today}`).expect(401);

      const sec = await userToken('SECRETAIRE_CAISSIER', 'sec@test.local');
      await get(`/attendance/day?date=${today}`, sec.token).expect(403);
      await call(s.entryToday.id, today, [], {}, sec.token).expect(403);

      const aud = await userToken('AUDITEUR', 'aud@test.local');
      await get(`/attendance/day?date=${today}`, aud.token).expect(200);
      await call(s.entryToday.id, today, [], {}, aud.token).expect(403);
    });

    it('le surveillant, la Direction et l’Administrateur peuvent faire l’appel', async () => {
      const s = await school();
      const surv = await userToken('SURVEILLANT', 'surv@test.local');
      await call(s.entryToday.id, today, [], {}, surv.token).expect(201);
      const dir = await userToken('DIRECTION', 'dir@test.local');
      // La Direction n'est pas l'auteur de l'appel du jour : sa correction exige un motif.
      await call(s.entryToday.id, today, [], {}, dir.token).expect(422);
      await call(s.entryToday.id, today, [], { motif: 'Vérification' }, dir.token).expect(201);
      await call(s.entryYesterday.id, yesterday, [], { motif: 'Appel oublié' }, dir.token).expect(201);
    });
  });

  describe('feuille d’appel', () => {
    it('affiche toute la classe présente par défaut, par ordre alphabétique, sans les inscriptions annulées', async () => {
      const s = await school();
      await prisma.enrollment.updateMany({ where: { studentId: s.s2.id }, data: { statut: 'ANNULEE' } });
      const sheet = (await get(`/attendance/sheet?entryId=${s.entryToday.id}&date=${today}`).expect(200)).body;
      expect(sheet.eleves.map((e: { nom: string }) => e.nom)).toEqual(['Bakala', 'Zola']);
      expect(sheet.eleves.every((e: { statut: string }) => e.statut === 'PRESENT')).toBe(true);
      expect(sheet.appel).toBeNull();
      expect(sheet.verrouille).toBe(false);
      expect(sheet.parametres.retardMaxMinutes).toBe(15);
      expect(sheet.seance.heureDebut).toBe('08:00');
    });

    it('la journée liste les séances avec l’état de leur appel', async () => {
      const s = await school();
      let day = (await get(`/attendance/day?date=${today}`).expect(200)).body;
      expect(day.seances).toHaveLength(1);
      expect(day.seances[0].appel).toBeNull();

      await call(s.entryToday.id, today, [{ studentId: s.s1.id, absent: true }, { studentId: s.s2.id, minutesRetard: 5 }]).expect(201);
      day = (await get(`/attendance/day?date=${today}`).expect(200)).body;
      expect(day.seances[0].appel).toMatchObject({ absents: 1, retards: 1, eleves: 3 });
    });
  });

  describe('saisie d’un appel (RV05, D57)', () => {
    it('calcule le statut d’après le seuil paramétré : présent, retard, absent', async () => {
      const s = await school();
      const res = await call(s.entryToday.id, today, [
        { studentId: s.s1.id, minutesRetard: 10 },
        { studentId: s.s2.id, minutesRetard: 20 },
        { studentId: s.s3.id, absent: true },
      ]).expect(201);
      const by = (id: string) => res.body.eleves.find((e: { studentId: string }) => e.studentId === id);
      expect(by(s.s1.id)).toMatchObject({ statut: 'RETARD', minutesRetard: 10 });
      expect(by(s.s2.id)).toMatchObject({ statut: 'ABSENT', minutesRetard: 20 });
      expect(by(s.s3.id)).toMatchObject({ statut: 'ABSENT', minutesRetard: null });
    });

    it('le seuil se change par paramètre, sans toucher au code', async () => {
      const s = await school();
      await patch('/pedagogy/settings', { retardMaxMinutes: 5 }).expect(200);
      const res = await call(s.entryToday.id, today, [{ studentId: s.s1.id, minutesRetard: 10 }]).expect(201);
      expect(res.body.eleves.find((e: { studentId: string }) => e.studentId === s.s1.id).statut).toBe('ABSENT');
      await patch('/pedagogy/settings', { retardMaxMinutes: 0 }).expect(400);
      await patch('/pedagogy/settings', { delaiJustificatifJours: 5 }).expect(200);
      expect((await get('/pedagogy/settings').expect(200)).body.delaiJustificatifJours).toBe(5);
    });

    it('renvoyer le même appel ne crée jamais de doublon (synchronisation hors ligne)', async () => {
      const s = await school();
      const body = { entryId: s.entryToday.id, date: today, absences: [{ studentId: s.s1.id, absent: true }] };
      const send = () =>
        request(app.getHttpServer())
          .post('/attendance/calls')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', 'cle-appel-1')
          .send(body);
      await send().expect(201);
      await send().expect(201); // même clé : réponse rejouée
      await post('/attendance/calls', body).expect(201); // sans clé : même état, pas de doublon

      expect(await prisma.attendanceCall.count()).toBe(1);
      expect(await prisma.attendanceRecord.count()).toBe(3);
      expect(await prisma.attendanceCorrection.count()).toBe(0);
    });

    it('l’auteur modifie son appel du jour sans motif ; les élèves non listés redeviennent présents', async () => {
      const s = await school();
      await call(s.entryToday.id, today, [{ studentId: s.s1.id, absent: true }]).expect(201);
      const res = await call(s.entryToday.id, today, [{ studentId: s.s2.id, minutesRetard: 3 }]).expect(201);
      const by = (id: string) => res.body.eleves.find((e: { studentId: string }) => e.studentId === id);
      expect(by(s.s1.id).statut).toBe('PRESENT');
      expect(by(s.s2.id).statut).toBe('RETARD');
      expect(await prisma.attendanceCorrection.count()).toBe(0);
      expect(await prisma.attendanceCall.count()).toBe(1);
    });

    it('refuse les saisies incohérentes', async () => {
      const s = await school();
      await call(s.entryToday.id, today, [{ studentId: 'inconnu', absent: true }]).expect(422);
      await call(s.entryToday.id, today, [{ studentId: s.s1.id, absent: true }, { studentId: s.s1.id, minutesRetard: 5 }]).expect(400);
      await call(s.entryToday.id, today, [{ studentId: s.s1.id }]).expect(400);
      await call(s.entryToday.id, today, [{ studentId: s.s1.id, minutesRetard: 60 }]).expect(422); // séance de 50 minutes
      await call(s.entryToday.id, addDays(today, 1), []).expect(422); // pas encore eu lieu
      await call(s.entryYesterday.id, today, []).expect(422); // cette séance n'a pas lieu aujourd'hui
      await post('/attendance/calls', { entryId: s.entryToday.id, date: 'hier', absences: [] }).expect(400);
    });

    it('refuse l’appel d’une séance annulée et note le remplaçant d’une séance remplacée', async () => {
      const s = await school();
      await post(`/timetable-entries/${s.entryToday.id}/exceptions`, {
        date: today,
        type: 'ANNULEE',
        motif: 'Grève',
      }).expect(201);
      await call(s.entryToday.id, today, []).expect(422);

      await post(`/timetable-entries/${s.entryYesterday.id}/exceptions`, {
        date: yesterday,
        type: 'REMPLACEE',
        motif: 'Absence',
        replacementTeacherId: s.t2.id,
      }).expect(201);
      // Hier : jour passé, la vie scolaire (Administrateur, ATTENDANCE_CORRECT) saisit après coup avec un motif.
      await call(s.entryYesterday.id, yesterday, [], { motif: 'Appel oublié' }).expect(201);
      const saved = await prisma.attendanceCall.findFirstOrThrow({ where: { entryId: s.entryYesterday.id } });
      expect(saved.teacherId).toBe(s.t2.id); // le remplaçant, pas l'enseignant habituel
    });
  });

  describe('verrouillage et corrections (RV04, D59)', () => {
    it('un autre utilisateur ne modifie pas l’appel du jour ; la vie scolaire le corrige avec un motif tracé', async () => {
      const s = await school();
      const prof = await takeOnlyToken();
      await call(s.entryToday.id, today, [{ studentId: s.s1.id, absent: true }], {}, prof.token).expect(201);

      const other = await takeOnlyToken('prof2@test.local');
      const conflict = await call(s.entryToday.id, today, [], {}, other.token).expect(409);
      expect(conflict.body.message).toContain('déjà été fait');

      // Vie scolaire : motif obligatoire.
      await call(s.entryToday.id, today, []).expect(422);
      await call(s.entryToday.id, today, [], { motif: 'Élève arrivé avec un mot du médecin' }).expect(201);
      const corrections = await prisma.attendanceCorrection.findMany();
      expect(corrections).toHaveLength(1);
      expect(corrections[0]).toMatchObject({ ancienStatut: 'ABSENT', nouveauStatut: 'PRESENT' });
      expect(corrections[0].motif).toContain('médecin');
    });

    it('après la fin de la journée, l’auteur ne corrige plus : seule la vie scolaire, avec motif', async () => {
      const s = await school();
      const prof = await takeOnlyToken();
      // Appel fait hier, sur l'appareil, sans Internet : accepté car l'heure de saisie est bien celle du jour.
      const stamp = `${yesterday}T10:30:00+01:00`;
      await call(s.entryYesterday.id, yesterday, [{ studentId: s.s1.id, absent: true }], { saisiLe: stamp }, prof.token).expect(201);
      const stored = await prisma.attendanceCall.findFirstOrThrow({ where: { entryId: s.entryYesterday.id } });
      expect(stored.saisieHorsLigneAt).not.toBeNull();

      // Le lendemain, l'auteur veut corriger sans heure de saisie du jour : verrouillé.
      await call(s.entryYesterday.id, yesterday, [], {}, prof.token).expect(403);
      await call(s.entryYesterday.id, yesterday, [], { motif: 'x' }, prof.token).expect(403);

      // Vie scolaire : motif obligatoire, puis correction tracée.
      await call(s.entryYesterday.id, yesterday, []).expect(422);
      await call(s.entryYesterday.id, yesterday, [{ studentId: s.s2.id, minutesRetard: 8 }], { motif: 'Erreur de saisie' }).expect(201);
      const corrections = await prisma.attendanceCorrection.findMany({ orderBy: { createdAt: 'asc' } });
      expect(corrections.map((c) => `${c.ancienStatut}>${c.nouveauStatut}`).sort()).toEqual(['ABSENT>PRESENT', 'PRESENT>RETARD']);

      const history = (await get(`/attendance/students/${s.s1.id}/history`).expect(200)).body;
      expect(history.lignes).toHaveLength(0); // plus absent
      const history2 = (await get(`/attendance/students/${s.s2.id}/history`).expect(200)).body;
      expect(history2.lignes[0].corrections[0]).toMatchObject({ de: 'PRESENT', vers: 'RETARD', motif: 'Erreur de saisie' });
    });

    it('un appel oublié ne se saisit après coup que par la vie scolaire, avec motif', async () => {
      const s = await school();
      const prof = await takeOnlyToken();
      await call(s.entryYesterday.id, yesterday, [], {}, prof.token).expect(403);
      await call(s.entryYesterday.id, yesterday, []).expect(422);
      await call(s.entryYesterday.id, yesterday, [{ studentId: s.s1.id, absent: true }], { motif: 'Appel oublié' }).expect(201);
      expect(await prisma.attendanceCorrection.count()).toBe(1); // l'absence saisie après coup est tracée
    });

    it('refuse une heure de saisie dans le futur ou de plus de 45 jours', async () => {
      const s = await school();
      const prof = await takeOnlyToken();
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const old = new Date(Date.now() - 46 * 24 * 60 * 60 * 1000).toISOString();
      await call(s.entryToday.id, today, [], { saisiLe: future }, prof.token).expect(400);
      await call(s.entryToday.id, today, [], { saisiLe: old }, prof.token).expect(400);
    });
  });

  describe('justificatifs (D58)', () => {
    async function absentToday() {
      const s = await school();
      const res = await call(s.entryToday.id, today, [
        { studentId: s.s1.id, absent: true },
        { studentId: s.s2.id, minutesRetard: 5 },
      ]).expect(201);
      const rec = (id: string) => res.body.eleves.find((e: { studentId: string }) => e.studentId === id).recordId;
      return { s, absent: rec(s.s1.id), retard: rec(s.s2.id), present: rec(s.s3.id) };
    }

    it('enregistre, puis accepte ou refuse un justificatif ; une seule décision', async () => {
      const { absent } = await absentToday();
      const reason = (await post('/absence-reasons', { libelle: 'Maladie' }).expect(201)).body;

      await post(`/attendance/records/${absent}/justification`, {}).expect(422); // ni motif ni commentaire
      const created = (await post(`/attendance/records/${absent}/justification`, { reasonId: reason.id }).expect(201)).body;
      expect(created.statut).toBe('EN_ATTENTE');
      expect(created.horsDelai).toBe(false);
      await post(`/attendance/records/${absent}/justification`, { commentaire: 'x' }).expect(409);

      const decided = (await patch(`/attendance/justifications/${created.id}`, { statut: 'ACCEPTEE' }).expect(200)).body;
      expect(decided.statut).toBe('ACCEPTEE');
      await patch(`/attendance/justifications/${created.id}`, { statut: 'REFUSEE' }).expect(409);
      await patch(`/attendance/justifications/${created.id}`, { statut: 'PEUT-ETRE' }).expect(400);
    });

    it('refuse de justifier un élève présent, et un motif désactivé', async () => {
      const { present, absent } = await absentToday();
      await post(`/attendance/records/${present}/justification`, { commentaire: 'x' }).expect(422);
      // Le présent par défaut n'a pas de ligne tant que rien n'est saisi ? Si : l'appel crée tout le monde.
      const reason = (await post('/absence-reasons', { libelle: 'Décès' }).expect(201)).body;
      await patch(`/absence-reasons/${reason.id}`, { actif: false }).expect(200);
      await post(`/attendance/records/${absent}/justification`, { reasonId: reason.id }).expect(409);
      await post('/attendance/records/inconnu/justification', { commentaire: 'x' }).expect(404);
    });

    it('signale « hors délai » un justificatif déposé après le délai paramétré', async () => {
      const s = await school();
      // Il y a une semaine : même jour de la semaine qu'aujourd'hui, donc la séance existe.
      const res = await call(s.entryToday.id, lastWeek, [{ studentId: s.s1.id, absent: true }], { motif: 'Appel tardif' }).expect(201);
      const record = res.body.eleves.find((e: { studentId: string }) => e.studentId === s.s1.id).recordId;
      const late = (await post(`/attendance/records/${record}/justification`, { commentaire: 'Certificat' }).expect(201)).body;
      expect(late.horsDelai).toBe(true);
    });

    it('la décision et la saisie exigent ATTENDANCE_CORRECT : un enseignant ne justifie pas', async () => {
      const { absent } = await absentToday();
      const prof = await takeOnlyToken();
      await post(`/attendance/records/${absent}/justification`, { commentaire: 'x' }, prof.token).expect(403);
      const created = (await post(`/attendance/records/${absent}/justification`, { commentaire: 'x' }).expect(201)).body;
      await patch(`/attendance/justifications/${created.id}`, { statut: 'ACCEPTEE' }, prof.token).expect(403);
    });

    it('la liste des absences se filtre par justificatif et l’historique compte les excusées', async () => {
      const { s, absent, retard } = await absentToday();
      const j = (await post(`/attendance/records/${absent}/justification`, { commentaire: 'Certificat' }).expect(201)).body;
      await patch(`/attendance/justifications/${j.id}`, { statut: 'ACCEPTEE' }).expect(200);

      const none = (await get('/attendance/absences?justification=aucune').expect(200)).body;
      expect(none.map((r: { recordId: string }) => r.recordId)).toEqual([retard]);
      const accepted = (await get('/attendance/absences?justification=acceptee').expect(200)).body;
      expect(accepted.map((r: { recordId: string }) => r.recordId)).toEqual([absent]);
      await get('/attendance/absences?justification=bof').expect(400);
      const byClass = (await get(`/attendance/absences?classId=${s.klass.id}&from=${today}&to=${today}`).expect(200)).body;
      expect(byClass).toHaveLength(2);

      const h1 = (await get(`/attendance/students/${s.s1.id}/history`).expect(200)).body;
      expect(h1.compteurs).toMatchObject({ absences: 1, retards: 0, excusees: 1, nonJustifiees: 0, seancesAppelees: 1 });
      const h2 = (await get(`/attendance/students/${s.s2.id}/history`).expect(200)).body;
      expect(h2.compteurs).toMatchObject({ absences: 0, retards: 1, excusees: 0, nonJustifiees: 1 });
      await get('/attendance/students/inconnu/history').expect(404);
    });
  });

  describe('motifs d’absence', () => {
    it('la Direction saisit les motifs ; doublon, suppression d’un motif utilisé et permissions', async () => {
      const r = (await post('/absence-reasons', { libelle: 'Maladie' }).expect(201)).body;
      await post('/absence-reasons', { libelle: '  maladie ' }).expect(409);
      await post('/absence-reasons', { libelle: '' }).expect(400);

      const surv = await userToken('SURVEILLANT', 'surv@test.local');
      await get('/absence-reasons', surv.token).expect(200);
      await post('/absence-reasons', { libelle: 'Voyage' }, surv.token).expect(403);

      const s = await school();
      const res = await call(s.entryToday.id, today, [{ studentId: s.s1.id, absent: true }]).expect(201);
      const record = res.body.eleves.find((e: { studentId: string }) => e.studentId === s.s1.id).recordId;
      await post(`/attendance/records/${record}/justification`, { reasonId: r.id }).expect(201);
      await del(`/absence-reasons/${r.id}`).expect(409);
      const other = (await post('/absence-reasons', { libelle: 'Voyage' }).expect(201)).body;
      await del(`/absence-reasons/${other.id}`).expect(200);
    });
  });

  describe('journal d’audit', () => {
    it('trace l’appel, la correction, le justificatif et sa décision', async () => {
      const s = await school();
      const res = await call(s.entryToday.id, today, [{ studentId: s.s1.id, absent: true }]).expect(201);
      await call(s.entryToday.id, today, [{ studentId: s.s1.id, absent: true }, { studentId: s.s2.id, minutesRetard: 4 }]).expect(201); // même auteur, même jour : simple mise à jour
      const record = res.body.eleves.find((e: { studentId: string }) => e.studentId === s.s1.id).recordId;
      const j = (await post(`/attendance/records/${record}/justification`, { commentaire: 'x' }).expect(201)).body;
      await patch(`/attendance/justifications/${j.id}`, { statut: 'REFUSEE' }).expect(200);
      await call(s.entryYesterday.id, yesterday, [], { motif: 'Oubli' }).expect(201); // saisie après coup : correction

      const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
      for (const a of [
        'ATTENDANCE_CALL_CREATE',
        'ATTENDANCE_CALL_UPDATE',
        'ATTENDANCE_CALL_CORRECT',
        'ATTENDANCE_JUSTIFICATION_CREATE',
        'ATTENDANCE_JUSTIFICATION_DECIDE',
      ]) {
        expect(actions).toContain(a);
      }
    });
  });
});

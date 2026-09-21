import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays, weekdayOf } from '../src/timetable/timetable.util';

/**
 * Lot 10 : pointage des enseignants par QR code (D62, RV06, RV07). Les scans sont datés d'hier avec
 * `scanneLe` (comme un scan fait sans Internet) pour ne pas dépendre de l'heure à laquelle les tests tournent.
 * Heures locales de l'établissement : Africa/Brazzaville, UTC+1 toute l'année.
 */
describe('Pointage des enseignants (e2e, Lot 10)', () => {
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
  const at = (hhmm: string, day = yesterday) => `${day}T${hhmm}:00+01:00`;

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

  /**
   * Trois enseignants : t1 (séances, deux cours d'affilée), t2 (journée), t3 (séances, remplaçant possible).
   * Hier : E1 08:00-08:50 salle 1 (t1), E2 08:50-09:40 salle 2 (t1), E3 10:00-10:50 salle 1 (t2).
   */
  async function school() {
    await patch('/pedagogy/settings', { joursClasse: [0, 1, 2, 3, 4, 5, 6] }).expect(200);
    const section = (await post('/sections', { code: 'FR', nom: 'Francophone' })).body;
    const cycle = (await post('/cycles', { sectionId: section.id, code: 'PRIM', nom: 'Primaire' })).body;
    const level = (await post('/levels', { cycleId: cycle.id, code: 'CM2', nom: 'CM2' })).body;
    const year = (
      await post('/academic-years', { libelle: '2026-2027', dateDebut: addDays(today, -120), dateFin: addDays(today, 200) })
    ).body;
    const classA = (await post('/classes', { levelId: level.id, academicYearId: year.id, nom: 'CM2 A' })).body;
    const classB = (await post('/classes', { levelId: level.id, academicYearId: year.id, nom: 'CM2 B' })).body;
    const h1 = (await post('/time-slots', { libelle: 'H1', heureDebut: '08:00', heureFin: '08:50' })).body;
    const h2 = (await post('/time-slots', { libelle: 'H2', heureDebut: '08:50', heureFin: '09:40' })).body;
    const h3 = (await post('/time-slots', { libelle: 'H3', heureDebut: '10:00', heureFin: '10:50' })).body;
    const math = (await post('/subjects', { code: 'MATH', nom: 'Mathématiques' })).body;
    const fr = (await post('/subjects', { code: 'FR', nom: 'Français' })).body;
    for (const sub of [math, fr]) await put(`/subjects/${sub.id}/levels`, { levels: [{ levelId: level.id }] }).expect(200);
    const t1 = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
    const t2 = (await post('/teachers', { nom: 'Mabiala', prenom: 'Claire' })).body;
    const t3 = (await post('/teachers', { nom: 'Okemba', prenom: 'Jean' })).body;
    await post('/assignments', { classId: classA.id, subjectId: math.id, teacherId: t1.id }).expect(201);
    await post('/assignments', { classId: classA.id, subjectId: fr.id, teacherId: t1.id }).expect(201);
    await post('/assignments', { classId: classB.id, subjectId: math.id, teacherId: t2.id }).expect(201);
    const room1 = (await post('/rooms', { nom: 'Salle 1' })).body;
    const room2 = (await post('/rooms', { nom: 'Salle 2' })).body;

    const tt = (await post('/timetables', { academicYearId: year.id }).expect(201)).body;
    const day = weekdayOf(yesterday);
    const mk = async (classId: string, subjectId: string, timeSlotId: string, roomId: string) =>
      (await post(`/timetables/${tt.id}/entries`, { classId, subjectId, timeSlotId, jourSemaine: day, roomId }).expect(201)).body;
    const e1 = await mk(classA.id, math.id, h1.id, room1.id);
    const e2 = await mk(classA.id, fr.id, h2.id, room2.id);
    const e3 = await mk(classB.id, math.id, h3.id, room1.id);
    // La version prend effet hier : seule la journée d'hier compte dans les récapitulatifs.
    await post(`/timetables/${tt.id}/publish`, { dateEffet: yesterday }).expect(201);

    // Comptes des enseignants, reliés à leur fiche.
    const p1 = await userToken('ENSEIGNANT', 'p1@test.local');
    const p2 = await userToken('ENSEIGNANT', 'p2@test.local');
    const p3 = await userToken('ENSEIGNANT', 'p3@test.local');
    await patch(`/teachers/${t1.id}`, { userId: p1.user.id }).expect(200);
    await patch(`/teachers/${t2.id}`, { userId: p2.user.id, modePointage: 'JOURNEE' }).expect(200);
    await patch(`/teachers/${t3.id}`, { userId: p3.user.id }).expect(200);

    const codes = (await post('/pointage-codes/generate', {}).expect(201)).body as Array<{ type: string; roomId: string | null; token: string }>;
    const tokenOf = (roomId: string | null) => codes.find((c) => c.roomId === roomId)!.token;
    return {
      year, classA, classB, math, fr, t1, t2, t3, room1, room2, e1, e2, e3, p1, p2, p3,
      gate: tokenOf(null), salle1: tokenOf(room1.id), salle2: tokenOf(room2.id),
    };
  }

  const scan = (t: string, code: string, when?: string) => post('/teacher-checkins/scan', { code, ...(when ? { scanneLe: when } : {}) }, t);

  describe('permissions et QR codes', () => {
    it('chaque rôle n’accède qu’à ce qui le concerne', async () => {
      const s = await school();
      await request(app.getHttpServer()).get(`/teacher-checkins/day?date=${yesterday}`).expect(401);
      const surv = await userToken('SURVEILLANT', 'surv@test.local');
      const sec = await userToken('SECRETAIRE_CAISSIER', 'sec@test.local');

      await get(`/teacher-checkins/day?date=${yesterday}`, s.p1.token).expect(403); // un enseignant ne lit pas les autres
      await get(`/teacher-checkins/day?date=${yesterday}`, sec.token).expect(403);
      await get(`/teacher-checkins/day?date=${yesterday}`, surv.token).expect(200);
      await scan(surv.token, s.salle1, at('08:00')).expect(403); // le surveillant ne pointe pas pour lui
      await get('/pointage-codes', surv.token).expect(403); // les QR ne se gèrent qu'avec PEDAGOGY_MANAGE
      await get('/pointage-codes', s.p1.token).expect(403);
      await get('/teacher-checkins/me', s.p1.token).expect(200);
    });

    it('génère les QR sans toucher à ceux qui existent, les régénère, et ne les expose jamais ailleurs', async () => {
      const s = await school();
      const again = (await post('/pointage-codes/generate', {}).expect(201)).body as Array<{ token: string; roomId: string | null }>;
      expect(again.find((c) => c.roomId === s.room1.id)!.token).toBe(s.salle1);
      expect(again).toHaveLength(3); // entrée + deux salles

      const rotated = (await post('/pointage-codes/rotate', { roomId: s.room1.id }).expect(201)).body as Array<{ token: string; roomId: string | null }>;
      expect(rotated.find((c) => c.roomId === s.room1.id)!.token).not.toBe(s.salle1);
      await scan(s.p1.token, s.salle1, at('08:00')).expect(404); // l'ancien QR affiché ne marche plus

      const rooms = JSON.stringify((await get('/rooms', s.p1.token).expect(200)).body);
      for (const t of [s.salle1, s.salle2, s.gate]) expect(rooms).not.toContain(t);
      await post('/pointage-codes/rotate', { roomId: 'inconnue' }).expect(404);
    });

    it('supprimer une salle supprime son QR', async () => {
      const s = await school();
      const room = (await post('/rooms', { nom: 'Salle 9' })).body;
      await post('/pointage-codes/generate', {}).expect(201);
      expect(await prisma.pointageCode.count({ where: { roomId: room.id } })).toBe(1);
      await del(`/rooms/${room.id}`).expect(200);
      expect(await prisma.pointageCode.count({ where: { roomId: room.id } })).toBe(0);
      expect(s.gate).toBeDefined();
    });

    it('relie un compte à une fiche : un compte, une fiche, jamais deux', async () => {
      const s = await school();
      const users = (await get('/teachers/linkable-users').expect(200)).body as Array<{ id: string; teacherId: string | null }>;
      expect(users.find((u) => u.id === s.p1.user.id)!.teacherId).toBe(s.t1.id);
      const conflict = await patch(`/teachers/${s.t3.id}`, { userId: s.p1.user.id }).expect(409);
      expect(conflict.body.message).toContain('Paul Ngoma');
      await patch(`/teachers/${s.t1.id}`, { userId: null }).expect(200);
      await patch(`/teachers/${s.t3.id}`, { userId: s.p1.user.id }).expect(200);
      await patch(`/teachers/${s.t3.id}`, { userId: 'inconnu' }).expect(404);
      await patch(`/teachers/${s.t3.id}`, { modePointage: 'PAR_HEURE' }).expect(400);
    });

    it('les règles de pointage se règlent par paramètre', async () => {
      await patch('/pedagogy/settings', { pointageFenetreMinutes: 30, pointageToleranceMinutes: 5, pointageEcartMinMinutes: 2 }).expect(200);
      const settings = (await get('/pedagogy/settings').expect(200)).body;
      expect(settings).toMatchObject({ pointageFenetreMinutes: 30, pointageToleranceMinutes: 5, pointageEcartMinMinutes: 2 });
      await patch('/pedagogy/settings', { pointageEcartMinMinutes: 0 }).expect(400);
    });
  });

  describe('pointage par séance (collège, lycée)', () => {
    it('début puis fin d’une séance, avec le retard calculé', async () => {
      const s = await school();
      const start = (await scan(s.p1.token, s.salle1, at('08:03')).expect(201)).body;
      expect(start).toMatchObject({ mode: 'SEANCE', type: 'DEBUT', heure: '08:03', retardMinutes: 3, retardSignale: false, statut: 'EN_ATTENTE' });
      expect(start.seance).toMatchObject({ className: 'CM2 A', subjectName: 'Mathématiques', heureDebut: '08:00' });
      const end = (await scan(s.p1.token, s.salle1, at('08:49')).expect(201)).body;
      expect(end).toMatchObject({ type: 'FIN', heure: '08:49' });
      expect(await prisma.teacherSessionCheckin.count()).toBe(1);
    });

    it('signale un retard au-delà de la tolérance paramétrée', async () => {
      const s = await school();
      const late = (await scan(s.p1.token, s.salle1, at('08:14')).expect(201)).body;
      expect(late).toMatchObject({ retardMinutes: 14, retardSignale: true });
    });

    it('à la jonction de deux cours, un scan clôt le premier et le suivant ouvre le second', async () => {
      const s = await school();
      await scan(s.p1.token, s.salle1, at('08:00')).expect(201);
      const fin = (await scan(s.p1.token, s.salle2, at('08:50')).expect(201)).body;
      expect(fin).toMatchObject({ type: 'FIN', seance: { className: 'CM2 A', subjectName: 'Mathématiques' } });
      const debut = (await scan(s.p1.token, s.salle2, at('08:51')).expect(201)).body;
      expect(debut).toMatchObject({ type: 'DEBUT', retardMinutes: 1, seance: { subjectName: 'Français' } });
      expect(await prisma.teacherSessionCheckin.count()).toBe(2);
    });

    it('refuse un double scan trop rapproché, mais un même scan rejoué ne change rien', async () => {
      const s = await school();
      await scan(s.p1.token, s.salle1, at('08:03')).expect(201);
      const dup = await scan(s.p1.token, s.salle1, at('08:05')).expect(409);
      expect(dup.body.message).toContain('08:03');
      // La file d'attente renvoie le même scan : même réponse, aucun doublon.
      const replay = (await scan(s.p1.token, s.salle1, at('08:03')).expect(201)).body;
      expect(replay).toMatchObject({ type: 'DEBUT', heure: '08:03' });
      expect(await prisma.teacherSessionCheckin.count()).toBe(1);
    });

    it('note un écart quand le QR scanné n’est pas celui de la salle prévue', async () => {
      const s = await school();
      const res = (await scan(s.p1.token, s.salle2, at('08:00')).expect(201)).body;
      expect(res.ecartSalle).toBe(true);
    });

    it('refuse le mauvais type de QR, un QR inconnu, un compte non relié, un jour sans séance', async () => {
      const s = await school();
      const wrongGate = await scan(s.p1.token, s.gate, at('08:00')).expect(422);
      expect(wrongGate.body.message).toContain('salle');
      const wrongRoom = await scan(s.p2.token, s.salle1, at('08:00')).expect(422);
      expect(wrongRoom.body.message).toContain('entrée');
      await scan(s.p1.token, 'jeton-inconnu-xyz', at('08:00')).expect(404);
      const orphan = await userToken('ENSEIGNANT', 'orphan@test.local');
      await scan(orphan.token, s.salle1, at('08:00')).expect(403);
      const noSession = await scan(s.p1.token, s.salle1, at('08:00', addDays(yesterday, -1))).expect(422);
      expect(noSession.body.message).toContain('aucune séance');
      await scan(s.p1.token, s.salle1, at('12:30')).expect(422); // aucune séance à cette heure-là
      await patch(`/teachers/${s.t1.id}`, { statut: 'INACTIF' }).expect(200);
      await scan(s.p1.token, s.salle1, at('08:00')).expect(409);
    });

    it('refuse une heure de scan dans le futur ou de plus de 45 jours', async () => {
      const s = await school();
      await scan(s.p1.token, s.salle1, new Date(Date.now() + 3600000).toISOString()).expect(400);
      await scan(s.p1.token, s.salle1, new Date(Date.now() - 46 * 86400000).toISOString()).expect(400);
    });

    it('crédite le remplaçant, jamais l’absent', async () => {
      const s = await school();
      await post(`/timetable-entries/${s.e1.id}/exceptions`, {
        date: yesterday,
        type: 'REMPLACEE',
        motif: 'Absence',
        replacementTeacherId: s.t3.id,
      }).expect(201);
      // Paul Ngoma n'a plus que la séance de français : son scan de 08:00 ne trouve rien à ouvrir.
      await scan(s.p1.token, s.salle1, at('07:50')).expect(422);
      const res = (await scan(s.p3.token, s.salle1, at('08:00')).expect(201)).body;
      expect(res).toMatchObject({ type: 'DEBUT', seance: { subjectName: 'Mathématiques' } });
      const ck = await prisma.teacherSessionCheckin.findFirstOrThrow();
      expect(ck.teacherId).toBe(s.t3.id);
    });
  });

  describe('pointage à l’arrivée et au départ (maternelle, primaire)', () => {
    it('arrivée, puis départ (le dernier scan du jour), avec le retard sur la première séance', async () => {
      const s = await school();
      const arrival = (await scan(s.p2.token, s.gate, at('10:04')).expect(201)).body;
      expect(arrival).toMatchObject({ mode: 'JOURNEE', type: 'ARRIVEE', heure: '10:04', heurePrevue: '10:00', retardMinutes: 4, retardSignale: false });
      await scan(s.p2.token, s.gate, at('10:06')).expect(409); // double scan
      const depart = (await scan(s.p2.token, s.gate, at('16:00')).expect(201)).body;
      expect(depart).toMatchObject({ type: 'DEPART', heure: '16:00' });
      await scan(s.p2.token, s.gate, at('16:30')).expect(201); // il repart plus tard : le dernier scan compte
      const ck = await prisma.teacherDayCheckin.findFirstOrThrow();
      expect(ck.departAt?.toISOString()).toBe(new Date(at('16:30')).toISOString());
      expect(await prisma.teacherDayCheckin.count()).toBe(1);
    });

    it('sans séance prévue, aucune heure d’attente n’est inventée', async () => {
      const s = await school();
      const arrival = (await scan(s.p2.token, s.gate, at('07:00', addDays(yesterday, -1))).expect(201)).body;
      expect(arrival).toMatchObject({ heurePrevue: null, retardMinutes: 0, retardSignale: false });
    });
  });

  describe('validation par un tiers (RV06)', () => {
    it('le surveillant valide ou rejette ; une décision ne se rejoue pas ; l’enseignant ne décide pas', async () => {
      const s = await school();
      const surv = await userToken('SURVEILLANT', 'surv@test.local');
      const first = (await scan(s.p1.token, s.salle1, at('08:00')).expect(201)).body;
      await scan(s.p1.token, s.salle1, at('08:50')).expect(201);

      await post(`/teacher-checkins/sessions/${first.pointageId}/decision`, { statut: 'VALIDE' }, s.p1.token).expect(403);
      await post(`/teacher-checkins/sessions/${first.pointageId}/decision`, { statut: 'REJETE' }, surv.token).expect(422); // motif requis
      await post(`/teacher-checkins/sessions/${first.pointageId}/decision`, { statut: 'VALIDE' }, surv.token).expect(201);
      await post(`/teacher-checkins/sessions/${first.pointageId}/decision`, { statut: 'REJETE', motif: 'x' }, surv.token).expect(409);
      const stored = await prisma.teacherSessionCheckin.findFirstOrThrow();
      expect(stored).toMatchObject({ statut: 'VALIDE', decidedById: surv.user.id });

      const day = (await scan(s.p2.token, s.gate, at('10:00')).expect(201)).body;
      await post(`/teacher-checkins/days/${day.pointageId}/decision`, { statut: 'REJETE', motif: 'Scan fait hors de l’école' }, surv.token).expect(201);
      expect((await prisma.teacherDayCheckin.findFirstOrThrow()).motif).toContain('hors de l’école');
      await post('/teacher-checkins/sessions/inconnu/decision', { statut: 'VALIDE' }, surv.token).expect(404);
    });

    it('un validateur qui est aussi enseignant ne valide ni ne corrige jamais son propre pointage', async () => {
      const s = await school();
      // Rôle de test : peut pointer ET valider.
      const role = await prisma.role.create({ data: { code: 'DOUBLE', nom: 'Double', description: 'test' } });
      const perms = await prisma.permission.findMany({ where: { code: { in: ['TEACHER_CHECKIN_SELF', 'TEACHER_CHECKIN_VALIDATE', 'TEACHER_CHECKIN_READ'] } } });
      await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
      const dbl = await userToken('DOUBLE', 'double@test.local');
      await patch(`/teachers/${s.t1.id}`, { userId: null }).expect(200);
      await patch(`/teachers/${s.t1.id}`, { userId: dbl.user.id }).expect(200);

      const mine = (await scan(dbl.token, s.salle1, at('08:00')).expect(201)).body;
      const denied = await post(`/teacher-checkins/sessions/${mine.pointageId}/decision`, { statut: 'VALIDE' }, dbl.token).expect(403);
      expect(denied.body.message).toContain('propre pointage');
      await post('/teacher-checkins/sessions/manual', { entryId: s.e1.id, date: yesterday, debut: '08:00', fin: '08:50', motif: 'x' }, dbl.token).expect(403);
      expect((await prisma.teacherSessionCheckin.findFirstOrThrow()).statut).toBe('EN_ATTENTE');

      // Un autre responsable, lui, peut.
      await post(`/teacher-checkins/sessions/${mine.pointageId}/decision`, { statut: 'VALIDE' }).expect(201);
    });

    it('la vie scolaire saisit ou corrige un pointage avec un motif, validé d’office et tracé', async () => {
      const s = await school();
      const surv = await userToken('SURVEILLANT', 'surv@test.local');
      const body = { entryId: s.e1.id, date: yesterday, debut: '08:05', fin: '08:50' };
      await post('/teacher-checkins/sessions/manual', { ...body, motif: '' }, surv.token).expect(400);
      await post('/teacher-checkins/sessions/manual', { ...body, fin: '08:00', motif: 'x' }, surv.token).expect(400);
      const created = (await post('/teacher-checkins/sessions/manual', { ...body, motif: 'Téléphone en panne' }, surv.token).expect(201)).body;
      expect(created).toMatchObject({ statut: 'VALIDE', source: 'MANUEL', debut: '08:05', fin: '08:50', retardMinutes: 5 });

      // Correction d'un pointage existant.
      await post('/teacher-checkins/sessions/manual', { ...body, debut: '08:00', motif: 'Erreur de scan' }, surv.token).expect(201);
      expect(await prisma.teacherSessionCheckin.count()).toBe(1);
      expect((await prisma.teacherSessionCheckin.findFirstOrThrow()).debutAt?.toISOString()).toBe(new Date(at('08:00')).toISOString());

      await post('/teacher-checkins/sessions/manual', { ...body, date: addDays(today, 1), motif: 'x' }, surv.token).expect(422);
      await post('/teacher-checkins/sessions/manual', { entryId: s.e3.id, date: yesterday, debut: '10:00', fin: '10:50', motif: 'x' }, surv.token).expect(422); // t2 pointe par journée
      await post('/teacher-checkins/days/manual', { teacherId: s.t1.id, date: yesterday, arrivee: '08:00', motif: 'x' }, surv.token).expect(422); // t1 pointe par séance
      const day = (await post('/teacher-checkins/days/manual', { teacherId: s.t2.id, date: yesterday, arrivee: '09:55', depart: '15:30', motif: 'Oubli de scan' }, surv.token).expect(201)).body;
      expect(day).toMatchObject({ statut: 'VALIDE', arrivee: '09:55', depart: '15:30', retardMinutes: 0 });

      const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
      expect(actions).toContain('TEACHER_CHECKIN_MANUAL');
    });

    it('refuse de saisir le pointage d’une séance annulée', async () => {
      const s = await school();
      await post(`/timetable-entries/${s.e2.id}/exceptions`, { date: yesterday, type: 'ANNULEE', motif: 'Grève' }).expect(201);
      await post('/teacher-checkins/sessions/manual', { entryId: s.e2.id, date: yesterday, debut: '08:50', fin: '09:40', motif: 'x' }).expect(422);
      await scan(s.p1.token, s.salle2, at('09:00')).expect(422); // plus de séance à ouvrir
    });
  });

  describe('vues et récapitulatif mensuel (RV07)', () => {
    it('la journée montre les séances non pointées, et l’enseignant voit son propre état', async () => {
      const s = await school();
      await scan(s.p1.token, s.salle1, at('08:00')).expect(201);
      await scan(s.p2.token, s.gate, at('09:58')).expect(201);
      const day = (await get(`/teacher-checkins/day?date=${yesterday}`).expect(200)).body;
      const e1 = day.seances.find((x: { entryId: string }) => x.entryId === s.e1.id);
      const e2 = day.seances.find((x: { entryId: string }) => x.entryId === s.e2.id);
      expect(e1.pointage).toMatchObject({ debut: '08:00', statut: 'EN_ATTENTE' });
      expect(e2.pointage).toBeNull();
      expect(day.seances.find((x: { entryId: string }) => x.entryId === s.e3.id)).toBeUndefined(); // t2 pointe par journée
      expect(day.journees).toHaveLength(1);
      expect(day.journees[0]).toMatchObject({ teacherName: 'Claire Mabiala', prevue: true });
      await get('/teacher-checkins/day?date=hier').expect(400);

      const me = (await get('/teacher-checkins/me', s.p2.token).expect(200)).body;
      expect(me.teacher.modePointage).toBe('JOURNEE');
    });

    it('calcule les heures effectuées d’après les seuls pointages validés', async () => {
      const s = await school();
      const surv = await userToken('SURVEILLANT', 'surv@test.local');
      // t1 : E1 validée (début et fin), E2 en attente. t2 : journée validée de 09:55 à 15:30.
      const a = (await scan(s.p1.token, s.salle1, at('08:14')).expect(201)).body;
      await scan(s.p1.token, s.salle1, at('08:50')).expect(201);
      await scan(s.p1.token, s.salle2, at('08:52')).expect(201);
      await post(`/teacher-checkins/sessions/${a.pointageId}/decision`, { statut: 'VALIDE' }, surv.token).expect(201);
      const d = (await scan(s.p2.token, s.gate, at('09:55')).expect(201)).body;
      await scan(s.p2.token, s.gate, at('15:30')).expect(201);
      await post(`/teacher-checkins/days/${d.pointageId}/decision`, { statut: 'VALIDE' }, surv.token).expect(201);

      const month = yesterday.slice(0, 7);
      const sum = (await get(`/teacher-checkins/summary?month=${month}`, surv.token).expect(200)).body;
      const row = (name: string) => sum.enseignants.find((r: { enseignant: string }) => r.enseignant === name);
      const t1 = row('Paul Ngoma');
      expect(t1).toMatchObject({ mode: 'SEANCE', seancesPrevues: 2, seancesTenues: 1, seancesEnAttente: 1, seancesNonPointees: 0, minutesEffectuees: 50, retards: 1, minutesRetard: 14 });
      const t2 = row('Claire Mabiala');
      expect(t2).toMatchObject({ mode: 'JOURNEE', joursPrevus: 1, joursPresents: 1, minutesEffectuees: 335, retards: 0 });
      expect(sum.toleranceRetardMinutes).toBe(10);
      const t3 = row('Jean Okemba');
      expect(t3).toMatchObject({ seancesPrevues: 0, seancesTenues: 0 });

      await get('/teacher-checkins/summary?month=2026-13', surv.token).expect(400);
      const one = (await get(`/teacher-checkins/summary?month=${month}&teacherId=${s.t1.id}`, surv.token).expect(200)).body;
      expect(one.enseignants).toHaveLength(1);
    });

    it('note l’absent comme ayant confié une séance à un remplaçant, et crédite le remplaçant', async () => {
      const s = await school();
      const surv = await userToken('SURVEILLANT', 'surv@test.local');
      await post(`/timetable-entries/${s.e1.id}/exceptions`, { date: yesterday, type: 'REMPLACEE', motif: 'Absence', replacementTeacherId: s.t3.id }).expect(201);
      const r = (await scan(s.p3.token, s.salle1, at('08:00')).expect(201)).body;
      await scan(s.p3.token, s.salle1, at('08:50')).expect(201);
      await post(`/teacher-checkins/sessions/${r.pointageId}/decision`, { statut: 'VALIDE' }, surv.token).expect(201);

      const sum = (await get(`/teacher-checkins/summary?month=${yesterday.slice(0, 7)}`, surv.token).expect(200)).body;
      const row = (name: string) => sum.enseignants.find((x: { enseignant: string }) => x.enseignant === name);
      expect(row('Jean Okemba')).toMatchObject({ seancesTenues: 1, minutesEffectuees: 50 });
      expect(row('Paul Ngoma')).toMatchObject({ seancesPrevues: 1, confieesARemplacant: 1 });
    });

    it('trace les codes, la décision et le lien de compte dans le journal d’audit', async () => {
      const s = await school();
      const first = (await scan(s.p1.token, s.salle1, at('08:00')).expect(201)).body;
      await post(`/teacher-checkins/sessions/${first.pointageId}/decision`, { statut: 'VALIDE' }).expect(201);
      const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(['POINTAGE_CODES_GENERATE', 'TEACHER_CHECKIN_VALIDATE', 'TEACHER_UPDATE']));
    });
  });
});

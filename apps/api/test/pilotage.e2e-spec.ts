import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays, weekdayOf } from '../src/timetable/timetable.util';
import { toDateOnly } from '../src/pedagogy/pedagogy.util';

/**
 * Lot 14 : pilotage 360°. Les indicateurs sont recalculés depuis les données sources (jamais saisis) : le jeu de
 * données ci-dessous est écrit directement en base et chaque chiffre attendu se compte à la main.
 *
 * Quatre jours passés (j1 à j4), classe A (Alice, Brice, Chloé) et classe B (Diane) :
 *  j1 : A : Alice absente sans justificatif, Brice en retard (5 min), Chloé présente ; B : Diane absente sans justificatif
 *  j2 : A : Alice absente sans justificatif (délai encore en cours : il court jusqu'à aujourd'hui inclus), Brice absent justifié (acceptée), Chloé présente ; B : pas d'appel
 *  j3 : A : Alice absente, justificatif refusé ; Brice absent sans justificatif (délai encore en cours) ; Chloé présente ; B : pas d'appel
 *  j4 : A : Alice absente, justificatif en attente ; Brice et Chloé présents ; B : pas d'appel
 */
describe('Pilotage 360° (e2e, Lot 14)', () => {
  // Le jeu de données (plusieurs utilisateurs, hachage argon2) dépasse parfois les 5 s par défaut sur une machine chargée.
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
  const [j1, j2, j3, j4] = [
    addDays(today, -4),
    addDays(today, -3),
    addDays(today, -2),
    addDays(today, -1),
  ];

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

  async function userToken(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      sch.id,
      roleCode,
      { email },
    );
    return { id: user.id, token: await login(user.email, motDePasse) };
  }

  async function world() {
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
    const mk = async (nom: string, prenom: string, classId: string) => {
      const s = (
        await post('/students', {
          nom,
          prenom,
          sexe: 'F',
          dateNaissance: '2015-04-12',
          responsable: {
            nom,
            prenom: 'Parent',
            telephone: `24206${Math.floor(Math.random() * 1e7)}`,
            lien: 'Parent',
          },
        }).expect(201)
      ).body;
      await post('/enrollments', {
        studentId: s.id,
        classId,
        academicYearId: year.id,
      }).expect(201);
      return s;
    };
    const alice = await mk('Moukala', 'Alice', klassA.id);
    const brice = await mk('Moukala', 'Brice', klassA.id);
    const chloe = await mk('Nzila', 'Chloé', klassA.id);
    const diane = await mk('Zola', 'Diane', klassB.id);

    const h1 = (
      await post('/time-slots', {
        libelle: 'H1',
        heureDebut: '08:00',
        heureFin: '08:50',
      })
    ).body;
    const math = (
      await post('/subjects', { code: 'MATH', nom: 'Mathématiques' })
    ).body;
    await put(`/subjects/${math.id}/levels`, {
      levels: [{ levelId: level.id }],
    }).expect(200);
    const tA = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
    const tB = (await post('/teachers', { nom: 'Okemba', prenom: 'Anne' }))
      .body;
    await post('/assignments', {
      classId: klassA.id,
      subjectId: math.id,
      teacherId: tA.id,
    }).expect(201);
    await post('/assignments', {
      classId: klassB.id,
      subjectId: math.id,
      teacherId: tB.id,
    }).expect(201);
    const roomA = (await post('/rooms', { nom: 'Salle A' })).body;
    const roomB = (await post('/rooms', { nom: 'Salle B' })).body;
    const tt = (
      await post('/timetables', { academicYearId: year.id }).expect(201)
    ).body;
    // Une séance par jour de la semaine et par classe : l'emploi du temps couvre toute période.
    const entriesA: Record<number, { id: string }> = {};
    const entriesB: Record<number, { id: string }> = {};
    for (let d = 0; d <= 6; d += 1) {
      entriesA[d] = (
        await post(`/timetables/${tt.id}/entries`, {
          classId: klassA.id,
          subjectId: math.id,
          timeSlotId: h1.id,
          jourSemaine: d,
          roomId: roomA.id,
        }).expect(201)
      ).body;
      entriesB[d] = (
        await post(`/timetables/${tt.id}/entries`, {
          classId: klassB.id,
          subjectId: math.id,
          timeSlotId: h1.id,
          jourSemaine: d,
          roomId: roomB.id,
        }).expect(201)
      ).body;
    }
    await post(`/timetables/${tt.id}/publish`, {
      dateEffet: addDays(today, -30),
    }).expect(201);

    const adminUser = await prisma.user.findFirstOrThrow({
      where: { email: 'admin@shakespeareacademy.cg' },
    });
    type Rec = {
      s: { id: string };
      statut: 'PRESENT' | 'RETARD' | 'ABSENT';
      minutes?: number;
      just?: 'ACCEPTEE' | 'REFUSEE' | 'EN_ATTENTE';
    };
    const call = async (
      day: string,
      klass: { id: string },
      entry: { id: string },
      teacher: { id: string },
      recs: Rec[],
    ) => {
      const c = await prisma.attendanceCall.create({
        data: {
          entryId: entry.id,
          date: toDateOnly(day),
          classId: klass.id,
          subjectId: math.id,
          teacherId: teacher.id,
          heureDebut: '08:00',
          heureFin: '08:50',
          takenById: adminUser.id,
        },
      });
      for (const r of recs) {
        const rec = await prisma.attendanceRecord.create({
          data: {
            callId: c.id,
            studentId: r.s.id,
            statut: r.statut,
            minutesRetard: r.minutes ?? null,
          },
        });
        if (r.just)
          await prisma.absenceJustification.create({
            data: {
              recordId: rec.id,
              statut: r.just,
              declaredById: adminUser.id,
              commentaire: 'test',
            },
          });
      }
    };
    const wd = (day: string) => weekdayOf(day);
    await call(j1, klassA, entriesA[wd(j1)], tA, [
      { s: alice, statut: 'ABSENT' },
      { s: brice, statut: 'RETARD', minutes: 5 },
      { s: chloe, statut: 'PRESENT' },
    ]);
    await call(j1, klassB, entriesB[wd(j1)], tB, [
      { s: diane, statut: 'ABSENT' },
    ]);
    await call(j2, klassA, entriesA[wd(j2)], tA, [
      { s: alice, statut: 'ABSENT' },
      { s: brice, statut: 'ABSENT', just: 'ACCEPTEE' },
      { s: chloe, statut: 'PRESENT' },
    ]);
    await call(j3, klassA, entriesA[wd(j3)], tA, [
      { s: alice, statut: 'ABSENT', just: 'REFUSEE' },
      { s: brice, statut: 'ABSENT' },
      { s: chloe, statut: 'PRESENT' },
    ]);
    await call(j4, klassA, entriesA[wd(j4)], tA, [
      { s: alice, statut: 'ABSENT', just: 'EN_ATTENTE' },
      { s: brice, statut: 'PRESENT' },
      { s: chloe, statut: 'PRESENT' },
    ]);

    // Pointages de l'enseignant de A : j1 tenue à l'heure, j2 tenue avec 20 minutes de retard, j3 rien, j4 en attente.
    const checkin = (day: string, extra: object) =>
      prisma.teacherSessionCheckin.create({
        data: {
          teacherId: tA.id,
          entryId: entriesA[wd(day)].id,
          date: toDateOnly(day),
          classId: klassA.id,
          heureDebut: '08:00',
          heureFin: '08:50',
          ...extra,
        },
      });
    const at = (day: string, hm: string) => new Date(`${day}T${hm}:00+01:00`); // Africa/Brazzaville = UTC+1
    await checkin(j1, {
      statut: 'VALIDE',
      debutAt: at(j1, '08:00'),
      finAt: at(j1, '08:50'),
      retardMinutes: 0,
      decidedById: adminUser.id,
      decidedAt: new Date(),
    });
    await checkin(j2, {
      statut: 'VALIDE',
      debutAt: at(j2, '08:20'),
      finAt: at(j2, '08:50'),
      retardMinutes: 20,
      decidedById: adminUser.id,
      decidedAt: new Date(),
    });
    await checkin(j4, { statut: 'EN_ATTENTE', debutAt: at(j4, '08:00') });

    return {
      klassA,
      klassB,
      alice,
      brice,
      chloe,
      diane,
      tA,
      tB,
      entriesA,
      entriesB,
      adminUser,
    };
  }

  const range = `from=${j1}&to=${j4}`;
  const dash = async (t: string, qs = range) =>
    (await get(`/pilotage/dashboard?${qs}`, t).expect(200)).body;

  // ---------------------------------------------------------------------------- Permissions

  describe('accès', () => {
    it('réservé à la Direction : ni l’administrateur, ni la vie scolaire, ni un enseignant, ni un parent, ni sans jeton', async () => {
      await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      await get(`/pilotage/dashboard?${range}`, dir.token).expect(200);
      for (const [role, email] of [
        ['SURVEILLANT', 's@test.local'],
        ['ENSEIGNANT', 'e@test.local'],
        ['COMPTABLE', 'c@test.local'],
        ['SECRETAIRE_CAISSIER', 'sc@test.local'],
        ['AUDITEUR', 'a@test.local'],
      ]) {
        const u = await userToken(role, email);
        await get(`/pilotage/dashboard?${range}`, u.token).expect(403);
        await get(`/pilotage/export/enseignants?${range}`, u.token).expect(403);
      }
      await get(`/pilotage/dashboard?${range}`, admin).expect(403);
      await http().get('/pilotage/dashboard').expect(401);
    });

    it('la période est contrôlée : ordre, format, longueur maximale, classe inconnue', async () => {
      await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      await get(`/pilotage/dashboard?from=${j4}&to=${j1}`, dir.token).expect(
        400,
      );
      await get('/pilotage/dashboard?from=hier', dir.token).expect(400);
      await get(
        `/pilotage/dashboard?from=${addDays(today, -100)}&to=${today}`,
        dir.token,
      ).expect(400);
      await get(
        `/pilotage/dashboard?${range}&classId=inconnue`,
        dir.token,
      ).expect(404);
      const ok = await get(
        `/pilotage/dashboard?from=${addDays(today, -91)}&to=${today}`,
        dir.token,
      ).expect(200);
      expect(ok.body.periode.days).toBe(92);
      // Sans paramètre : le mois en cours jusqu'à aujourd'hui.
      const def = (await get('/pilotage/dashboard', dir.token).expect(200))
        .body;
      expect(def.periode).toMatchObject({
        from: `${today.slice(0, 8)}01`,
        to: today,
        aujourdhui: today,
      });
    });
  });

  // ----------------------------------------------------------------------------- Assiduité

  describe('assiduité, recalculée depuis les appels et les justificatifs', () => {
    it('les totaux se retrouvent à la main', async () => {
      await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const { assiduite } = await dash(dir.token);
      expect(assiduite.totaux).toMatchObject({
        total: 13,
        presents: 5,
        retards: 1,
        absents: 7,
        justifiees: 1,
        nonJustifiees: 3, // Alice j1, Alice j3 (refusée), Diane j1
        enAttente: 1,
        delaiEnCours: 2, // Alice j2 et Brice j3 : le délai de justification court encore
        appelsEffectues: 5,
      });
      expect(assiduite.totaux.tauxPresence).toBe(46.2);
      expect(assiduite.totaux.tauxAbsence).toBe(53.8);
      expect(assiduite.totaux.tauxRetard).toBe(7.7);
    });

    it('par classe (la plus touchée d’abord) et par jour', async () => {
      const w = await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const { assiduite } = await dash(dir.token);
      expect(
        assiduite.parClasse.map((c: { classe: string }) => c.classe),
      ).toEqual(['CM2 B', 'CM2 A']);
      expect(assiduite.parClasse[0]).toMatchObject({
        classId: w.klassB.id,
        total: 1,
        absents: 1,
        tauxAbsence: 100,
      });
      expect(assiduite.parClasse[1]).toMatchObject({
        classId: w.klassA.id,
        total: 12,
        presents: 5,
        retards: 1,
        absents: 6,
        tauxAbsence: 50,
      });
      expect(
        assiduite.parJour.map((j: { date: string; total: number }) => [
          j.date,
          j.total,
        ]),
      ).toEqual([
        [j1, 4],
        [j2, 3],
        [j3, 3],
        [j4, 3],
      ]);
    });

    it('le filtre par classe ne garde que cette classe', async () => {
      const w = await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const { assiduite } = await dash(
        dir.token,
        `${range}&classId=${w.klassA.id}`,
      );
      expect(assiduite.totaux).toMatchObject({
        total: 12,
        absents: 6,
        appelsEffectues: 4,
      });
      expect(assiduite.parClasse).toHaveLength(1);
    });

    it('une période sans appel donne des taux vides, jamais un 0 % trompeur', async () => {
      await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const { assiduite } = await dash(
        dir.token,
        `from=${addDays(today, -60)}&to=${addDays(today, -50)}`,
      );
      expect(assiduite.totaux).toMatchObject({
        total: 0,
        tauxPresence: null,
        tauxAbsence: null,
        appelsEffectues: 0,
      });
    });

    it('les appels manquants : séances prévues sans appel', async () => {
      await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const { appels } = (await dash(dir.token)).assiduite;
      // 4 jours x 2 classes = 8 séances prévues, 5 appels : la classe B n'a pas eu d'appel les jours j2, j3 et j4.
      expect(appels).toMatchObject({
        prevues: 8,
        effectuees: 5,
        manquants: 3,
        tauxCouverture: 62.5,
      });
      expect(
        appels.dernieres.map((m: { date: string; classe: string }) => [
          m.date,
          m.classe,
        ]),
      ).toEqual([
        [j4, 'CM2 B'],
        [j3, 'CM2 B'],
        [j2, 'CM2 B'],
      ]);
    });

    it('les indicateurs se recalculent à chaque demande : rien n’est stocké ni saisi', async () => {
      const w = await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const before = await dash(dir.token);
      const auditBefore = await prisma.auditLog.count();
      // Une nouvelle absence à la source change immédiatement le tableau de bord.
      const call = await prisma.attendanceCall.findFirstOrThrow({
        where: { date: toDateOnly(j4), classId: w.klassA.id },
      });
      await prisma.attendanceRecord.updateMany({
        where: { callId: call.id, studentId: w.chloe.id },
        data: { statut: 'ABSENT' },
      });
      const after = await dash(dir.token);
      expect(after.assiduite.totaux.absents).toBe(
        before.assiduite.totaux.absents + 1,
      );
      expect(after.assiduite.totaux.presents).toBe(
        before.assiduite.totaux.presents - 1,
      );
      // Consulter ne laisse aucune trace ni aucune donnée : la lecture n'écrit rien.
      expect(await prisma.auditLog.count()).toBe(auditBefore);
    });
  });

  // ----------------------------------------------------------------------------- Enseignants

  describe('ponctualité des enseignants, recalculée depuis les pointages', () => {
    it('séances prévues, tenues, retards et non pointées se retrouvent à la main', async () => {
      const w = await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const { enseignants } = await dash(dir.token);
      expect(enseignants.toleranceRetardMinutes).toBe(10);
      const ngoma = enseignants.lignes.find(
        (l: { teacherId: string }) => l.teacherId === w.tA.id,
      );
      expect(ngoma).toMatchObject({
        unite: 'séances',
        prevues: 4,
        tenues: 2,
        enAttente: 1,
        nonPointees: 1,
        retards: 1,
        minutesRetard: 20,
        minutesEffectuees: 100,
        tauxPresence: 50,
        tauxPonctualite: 50,
      });
      const okemba = enseignants.lignes.find(
        (l: { teacherId: string }) => l.teacherId === w.tB.id,
      );
      expect(okemba).toMatchObject({
        prevues: 4,
        tenues: 0,
        nonPointees: 4,
        tauxPresence: 0,
        tauxPonctualite: null,
      });
      expect(enseignants.totaux).toMatchObject({
        pointagesPrevus: 8,
        pointagesTenus: 2,
        nonPointes: 5,
        enAttenteDeValidation: 1,
        retards: 1,
        heuresEffectuees: 1.7,
        tauxPresence: 25,
        tauxPonctualite: 50,
      });
      // La ligne la moins ponctuelle vient d'abord.
      expect(enseignants.lignes[0].teacherId).toBe(w.tA.id);
    });

    it('un pointage rejeté ou en attente ne compte pas comme séance tenue', async () => {
      const w = await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      await prisma.teacherSessionCheckin.updateMany({
        where: { teacherId: w.tA.id, statut: 'VALIDE' },
        data: { statut: 'REJETE' },
      });
      const ngoma = (await dash(dir.token)).enseignants.lignes.find(
        (l: { teacherId: string }) => l.teacherId === w.tA.id,
      );
      expect(ngoma).toMatchObject({ tenues: 0, retards: 0 });
    });

    it('le récapitulatif mensuel existant du Lot 10 est inchangé', async () => {
      const w = await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const month = j4.slice(0, 7);
      const res = await get(
        `/teacher-checkins/summary?month=${month}&teacherId=${w.tA.id}`,
        dir.token,
      ).expect(200);
      expect(res.body.mois).toBe(month);
      expect(res.body.toleranceRetardMinutes).toBe(10);
      expect(res.body.enseignants).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------------- Alertes

  describe('alertes de décrochage (D61 : aucun seuil inventé)', () => {
    it('désactivées tant que la Direction n’a pas fixé de seuil', async () => {
      await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const { alertes, parametres } = await dash(dir.token);
      expect(alertes).toEqual({ actives: false, seuil: null, eleves: [] });
      expect(parametres.seuilAlerteAbsences).toBeNull();
      expect(
        (await prisma.school.findFirstOrThrow()).seuilAlerteAbsences,
      ).toBeNull();
    });

    it('le seuil se fixe dans les paramètres, s’efface, et refuse une valeur absurde', async () => {
      await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      await patch(
        '/pedagogy/settings',
        { seuilAlerteAbsences: 0 },
        dir.token,
      ).expect(400);
      const set = await patch(
        '/pedagogy/settings',
        { seuilAlerteAbsences: 3 },
        dir.token,
      ).expect(200);
      expect(set.body.seuilAlerteAbsences).toBe(3);
      expect(
        (await get('/pedagogy/settings', dir.token).expect(200)).body
          .seuilAlerteAbsences,
      ).toBe(3);
      const cleared = await patch(
        '/pedagogy/settings',
        { seuilAlerteAbsences: null },
        dir.token,
      ).expect(200);
      expect(cleared.body.seuilAlerteAbsences).toBeNull();
      // Une autre modification ne touche pas au seuil.
      await patch(
        '/pedagogy/settings',
        { seuilAlerteAbsences: 2 },
        dir.token,
      ).expect(200);
      await patch(
        '/pedagogy/settings',
        { retardMaxMinutes: 20 },
        dir.token,
      ).expect(200);
      expect(
        (await get('/pedagogy/settings', dir.token).expect(200)).body
          .seuilAlerteAbsences,
      ).toBe(2);
    });

    it('signale les élèves qui atteignent le seuil d’absences NON justifiées, pas les justifiées ni celles dont le délai court', async () => {
      const w = await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      await patch(
        '/pedagogy/settings',
        { seuilAlerteAbsences: 2 },
        dir.token,
      ).expect(200);
      const { alertes } = await dash(dir.token);
      expect(alertes.actives).toBe(true);
      expect(alertes.seuil).toBe(2);
      // Alice : 2 non justifiées (j1, et j3 refusée), 1 en attente (j4), 1 dont le délai court (j2) ; Brice n'en a aucune (une justifiée, une dont le délai court) ; Diane une seule.
      expect(alertes.eleves).toHaveLength(1);
      expect(alertes.eleves[0]).toMatchObject({
        studentId: w.alice.id,
        eleve: 'Alice Moukala',
        classe: 'CM2 A',
        nonJustifiees: 2,
        enAttente: 1,
        delaiEnCours: 1,
        retards: 0,
        derniereAbsence: j4,
      });

      await patch(
        '/pedagogy/settings',
        { seuilAlerteAbsences: 1 },
        dir.token,
      ).expect(200);
      const low = (await dash(dir.token)).alertes.eleves;
      expect(low.map((e: { eleve: string }) => e.eleve)).toEqual([
        'Alice Moukala',
        'Diane Zola',
      ]);
      expect(low.map((e: { eleve: string }) => e.eleve)).not.toContain(
        'Brice Moukala',
      );
    });

    it('une absence sans justificatif devient « non justifiée » quand son délai est écoulé, pas avant', async () => {
      const w = await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      await patch(
        '/pedagogy/settings',
        { seuilAlerteAbsences: 1 },
        dir.token,
      ).expect(200);
      // Brice a une absence du jour j3 sans justificatif : le délai (3 jours de classe) court jusqu'à aujourd'hui.
      const brice = () =>
        dash(dir.token).then((d) =>
          d.alertes.eleves.find(
            (e: { studentId: string }) => e.studentId === w.brice.id,
          ),
        );
      expect(await brice()).toBeUndefined();
      await patch(
        '/pedagogy/settings',
        { delaiJustificatifJours: 1 },
        dir.token,
      ).expect(200);
      expect(await brice()).toMatchObject({
        nonJustifiees: 1,
        delaiEnCours: 0,
      });
    });

    it('les alertes suivent le filtre de classe', async () => {
      const w = await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      await patch(
        '/pedagogy/settings',
        { seuilAlerteAbsences: 1 },
        dir.token,
      ).expect(200);
      const onlyB = (await dash(dir.token, `${range}&classId=${w.klassB.id}`))
        .alertes.eleves;
      expect(onlyB.map((e: { eleve: string }) => e.eleve)).toEqual([
        'Diane Zola',
      ]);
    });
  });

  // ------------------------------------------------------------------------------- Exports

  describe('exports CSV', () => {
    it('chaque tableau s’exporte en CSV lisible par Excel, avec les mêmes chiffres', async () => {
      await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const classes = await get(
        `/pilotage/export/assiduite-classes?${range}`,
        dir.token,
      ).expect(200);
      expect(classes.headers['content-type']).toContain('text/csv');
      expect(classes.headers['content-disposition']).toBe(
        `attachment; filename="pilotage-assiduite-classes-${j1}-${j4}.csv"`,
      );
      // Le fichier commence par un BOM UTF-8, sans lequel Excel affiche mal les accents.
      const hasBom = classes.text.charCodeAt(0) === 0xfeff;
      const lines = classes.text.slice(hasBom ? 1 : 0).split('\r\n');
      expect(hasBom).toBe(true);
      expect(lines[0]).toBe(
        "Classe;Présences saisies;Présents;Retards;Absents;Absences justifiées;Absences non justifiées;En attente de décision;Délai de justification en cours;Taux de présence (%);Taux d'absence (%)",
      );
      expect(lines[1]).toBe('CM2 B;1;0;0;1;0;1;0;0;0;100');
      expect(lines[2]).toBe('CM2 A;12;5;1;6;1;2;1;2;50;50');

      const days = await get(
        `/pilotage/export/assiduite-jours?${range}`,
        dir.token,
      ).expect(200);
      expect(days.text.split('\r\n')).toHaveLength(5); // en-tête + 4 jours
      const teachers = await get(
        `/pilotage/export/enseignants?${range}`,
        dir.token,
      ).expect(200);
      expect(teachers.text).toContain('Paul Ngoma');
    });

    it('l’export des alertes est refusé tant que les alertes sont désactivées, puis contient les élèves signalés', async () => {
      await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      await get(`/pilotage/export/alertes?${range}`, dir.token).expect(409);
      await patch(
        '/pedagogy/settings',
        { seuilAlerteAbsences: 2 },
        dir.token,
      ).expect(200);
      const res = await get(
        `/pilotage/export/alertes?${range}`,
        dir.token,
      ).expect(200);
      expect(res.text).toContain('Alice Moukala');
      expect(res.text).not.toContain('Diane');
    });

    it('un export inconnu est refusé, et chaque export est journalisé sans le contenu', async () => {
      await world();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      await get(`/pilotage/export/tout?${range}`, dir.token).expect(400);
      await patch(
        '/pedagogy/settings',
        { seuilAlerteAbsences: 1 },
        dir.token,
      ).expect(200);
      await get(`/pilotage/export/alertes?${range}`, dir.token).expect(200);
      await get(`/pilotage/export/enseignants?${range}`, dir.token).expect(200);
      const logs = await prisma.auditLog.findMany({
        where: { action: 'PILOTAGE_EXPORT' },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.entiteId)).toEqual(['alertes', 'enseignants']);
      expect(logs.every((l) => l.userId === dir.id)).toBe(true);
      expect(JSON.stringify(logs)).not.toMatch(/Alice|Diane|Ngoma/);
      expect(logs[0].nouvelleValeur).toMatchObject({
        kind: 'alertes',
        from: j1,
        to: j4,
      });
    });
  });
});

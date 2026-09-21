import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays, weekdayOf } from '../src/timetable/timetable.util';

/**
 * Lot 11 : comptes parents et portail en lecture (D66, D67, D76, RV08). Deux familles : Alice et Brice
 * (frère et sœur, responsable Moukala, Brice a aussi Mme Ndinga), et Carine (responsable Zola).
 */
describe('Comptes parents et portail (e2e, Lot 11)', () => {
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
  const PHONE_MOUKALA = '242060000001';
  const PHONE_ZOLA = '242060000002';
  const PHONE_NDINGA = '242060000003';

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
  const portalPost = (path: string, body: object) => request(app.getHttpServer()).post(path).send(body);

  async function userToken(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(prisma, sch.id, roleCode, { email });
    return login(user.email, motDePasse);
  }

  /** Deux familles, un emploi du temps, des paiements et une absence justifiée (pour Alice). */
  async function school() {
    await patch('/pedagogy/settings', { joursClasse: [0, 1, 2, 3, 4, 5, 6] }).expect(200);
    const section = (await post('/sections', { code: 'FR', nom: 'Francophone' })).body;
    const cycle = (await post('/cycles', { sectionId: section.id, code: 'PRIM', nom: 'Primaire' })).body;
    const level = (await post('/levels', { cycleId: cycle.id, code: 'CM2', nom: 'CM2' })).body;
    const year = (
      await post('/academic-years', { libelle: '2026-2027', dateDebut: addDays(today, -120), dateFin: addDays(today, 200) })
    ).body;
    const klassA = (await post('/classes', { levelId: level.id, academicYearId: year.id, nom: 'CM2 A' })).body;
    const klassB = (await post('/classes', { levelId: level.id, academicYearId: year.id, nom: 'CM2 B' })).body;

    const feeType = (await post('/fee-types', { code: 'INSCRIPTION', nom: "Frais d'inscription", obligatoire: true, avecTranches: false })).body;
    await post('/fee-schedules', { academicYearId: year.id, levelId: level.id, feeTypeId: feeType.id, montant: 45000 }).expect(201);

    const mkStudent = async (nom: string, prenom: string, responsable: { nom: string; prenom: string; telephone: string }, classId: string) => {
      const student = (
        await post('/students', { nom, prenom, sexe: 'F', dateNaissance: '2015-04-12', responsable: { ...responsable, lien: 'Parent' } }).expect(201)
      ).body;
      const enrollment = (await post('/enrollments', { studentId: student.id, classId, academicYearId: year.id }).expect(201)).body;
      return { student, enrollment };
    };
    const moukala = { nom: 'Moukala', prenom: 'Jean', telephone: PHONE_MOUKALA };
    const alice = await mkStudent('Moukala', 'Alice', moukala, klassA.id);
    const brice = await mkStudent('Moukala', 'Brice', moukala, klassA.id);
    const carine = await mkStudent('Zola', 'Carine', { nom: 'Zola', prenom: 'Marie', telephone: PHONE_ZOLA }, klassB.id);
    // Brice a un deuxième responsable.
    await post(`/students/${brice.student.id}/guardians`, { nom: 'Ndinga', prenom: 'Rose', telephone: PHONE_NDINGA, lien: 'Tante' }).expect(201);

    // Emploi du temps de CM2 A : une séance aujourd'hui, une hier.
    const h1 = (await post('/time-slots', { libelle: 'H1', heureDebut: '08:00', heureFin: '08:50' })).body;
    const h2 = (await post('/time-slots', { libelle: 'H2', heureDebut: '09:00', heureFin: '09:50' })).body;
    const math = (await post('/subjects', { code: 'MATH', nom: 'Mathématiques' })).body;
    await put(`/subjects/${math.id}/levels`, { levels: [{ levelId: level.id }] }).expect(200);
    const teacher = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
    await post('/assignments', { classId: klassA.id, subjectId: math.id, teacherId: teacher.id }).expect(201);
    await post('/assignments', { classId: klassB.id, subjectId: math.id, teacherId: teacher.id }).expect(201);
    const room = (await post('/rooms', { nom: 'Salle 1' })).body;
    const tt = (await post('/timetables', { academicYearId: year.id }).expect(201)).body;
    const mk = async (classId: string, timeSlotId: string, jourSemaine: number) =>
      (await post(`/timetables/${tt.id}/entries`, { classId, subjectId: math.id, timeSlotId, jourSemaine, roomId: room.id }).expect(201)).body;
    await mk(klassA.id, h1.id, weekdayOf(today));
    const entryYesterday = await mk(klassA.id, h2.id, weekdayOf(yesterday));
    await mk(klassB.id, h1.id, weekdayOf(yesterday)); // CM2 B : ne doit jamais apparaître chez les parents de CM2 A
    await post(`/timetables/${tt.id}/publish`, { dateEffet: yesterday }).expect(201);

    // Hier : Alice absente (justifiée), Carine absente aussi (autre famille).
    const call = (
      await post('/attendance/calls', {
        entryId: entryYesterday.id,
        date: yesterday,
        absences: [{ studentId: alice.student.id, absent: true }],
        motif: 'Appel saisi après coup',
      }).expect(201)
    ).body;
    const record = call.eleves.find((e: { studentId: string }) => e.studentId === alice.student.id).recordId;
    const reason = (await post('/absence-reasons', { libelle: 'Maladie' }).expect(201)).body;
    const just = (await post(`/attendance/records/${record}/justification`, { reasonId: reason.id }).expect(201)).body;
    await patch(`/attendance/justifications/${just.id}`, { statut: 'ACCEPTEE' }).expect(200);

    // Alice : un paiement partiel.
    const invoice = (await get(`/invoices/by-enrollment/${alice.enrollment.id}`).expect(200)).body;
    await post('/payments', { invoiceLineId: invoice.lines[0].id, montant: 20000 }).expect(201);

    const guardians = await prisma.guardian.findMany();
    const g = (tel: string) => guardians.find((x) => x.telephone === tel)!;
    return { alice, brice, carine, klassA, klassB, moukala: g(PHONE_MOUKALA), zola: g(PHONE_ZOLA), ndinga: g(PHONE_NDINGA), reason };
  }

  const activate = (telephone: string, code: string, extra: object = {}) =>
    portalPost('/portal/activate', { telephone, code, motDePasse: 'MotDePasse123', consentement: true, versionPolitique: '2026-09-v1', ...extra });

  /** Génère un code (secrétariat) et active le compte : renvoie le jeton du parent. */
  async function activeParent(guardianId: string, telephone: string, motDePasse = 'MotDePasse123') {
    const { body } = await post(`/parent-accounts/guardians/${guardianId}/activation-code`, {}).expect(201);
    const res = await portalPost('/portal/activate', { telephone, code: body.code, motDePasse, consentement: true, versionPolitique: '2026-09-v1' }).expect(201);
    return res.body.accessToken as string;
  }

  describe('permissions côté école', () => {
    it('le secrétariat gère les comptes, seule la Direction retire un accès', async () => {
      const s = await school();
      const sec = await userToken('SECRETAIRE_CAISSIER', 'sec@test.local');
      const comptable = await userToken('COMPTABLE', 'cpt@test.local');
      const dir = await userToken('DIRECTION', 'dir@test.local');
      await request(app.getHttpServer()).get('/parent-accounts').expect(401);
      await get('/parent-accounts', comptable).expect(403);
      await get('/parent-accounts', sec).expect(200);
      await post(`/parent-accounts/guardians/${s.moukala.id}/activation-code`, {}, sec).expect(201);

      const link = await prisma.studentGuardian.findFirstOrThrow({ where: { guardianId: s.moukala.id, studentId: s.alice.student.id } });
      await patch(`/parent-accounts/links/${link.id}/access`, { acces: false, motif: 'x' }, sec).expect(403);
      await patch(`/parent-accounts/links/${link.id}/access`, { acces: false, motif: 'x' }).expect(403); // Administrateur : pas la Direction (D67)
      await patch(`/parent-accounts/links/${link.id}/access`, { acces: false, motif: 'x' }, dir).expect(200);
    });

    it('liste les responsables avec leurs enfants et l’état du compte, et se recherche', async () => {
      const s = await school();
      const all = (await get('/parent-accounts').expect(200)).body as Array<{ id: string; nom: string; compte: unknown; enfants: unknown[] }>;
      expect(all).toHaveLength(3);
      const moukala = all.find((g) => g.id === s.moukala.id)!;
      expect(moukala.compte).toBeNull();
      expect(moukala.enfants).toHaveLength(2);
      const found = (await get('/parent-accounts?search=carine').expect(200)).body;
      expect(found.map((g: { id: string }) => g.id)).toEqual([s.zola.id]);
      const byPhone = (await get('/parent-accounts?search=060000003').expect(200)).body;
      expect(byPhone.map((g: { id: string }) => g.id)).toEqual([s.ndinga.id]);
    });
  });

  describe('activation par code (D66, D76)', () => {
    it('génère un code lisible dont seule l’empreinte est conservée, et un nouveau code invalide l’ancien', async () => {
      const s = await school();
      const first = (await post(`/parent-accounts/guardians/${s.moukala.id}/activation-code`, {}).expect(201)).body;
      expect(first.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      const stored = await prisma.parentActivationCode.findMany();
      expect(stored).toHaveLength(1);
      expect(JSON.stringify(stored)).not.toContain(first.code.replace('-', ''));
      const audit = JSON.stringify(await prisma.auditLog.findMany());
      expect(audit).not.toContain(first.code);

      const second = (await post(`/parent-accounts/guardians/${s.moukala.id}/activation-code`, {}).expect(201)).body;
      await activate(PHONE_MOUKALA, first.code).expect(401); // l'ancien code ne marche plus
      await activate(PHONE_MOUKALA, second.code).expect(201);
      await post('/parent-accounts/guardians/inconnu/activation-code', {}).expect(404);
    });

    it('active le compte : mot de passe choisi, consentement enregistré, numéro saisi sous une autre forme', async () => {
      const s = await school();
      const { code } = (await post(`/parent-accounts/guardians/${s.moukala.id}/activation-code`, {}).expect(201)).body;
      const res = await activate('+242 06 000 0001', code.toLowerCase().replace('-', ' ')).expect(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.parent).toMatchObject({ prenom: 'Jean', nom: 'Moukala' });
      const cookie = ([] as string[]).concat(res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(cookie).toContain('parent_refresh_token');
      expect(cookie).toContain('HttpOnly');

      const consent = await prisma.parentConsent.findMany();
      expect(consent).toHaveLength(1);
      expect(consent[0].version).toBe('2026-09-v1');
      expect((await prisma.parentAccount.findFirstOrThrow()).motDePasseHash).not.toContain('MotDePasse123');

      // Le code est à usage unique.
      await activate(PHONE_MOUKALA, code).expect(401);
      const list = (await get('/parent-accounts').expect(200)).body.find((g: { id: string }) => g.id === s.moukala.id);
      expect(list.compte).toMatchObject({ statut: 'ACTIF', consentement: { version: '2026-09-v1' } });
      expect(list.codeEnAttente).toBeNull();
    });

    it('exige le consentement et la version en vigueur de la politique', async () => {
      const s = await school();
      const { code } = (await post(`/parent-accounts/guardians/${s.moukala.id}/activation-code`, {}).expect(201)).body;
      await activate(PHONE_MOUKALA, code, { consentement: false }).expect(400);
      await activate(PHONE_MOUKALA, code, { versionPolitique: 'ancienne' }).expect(400);
      await activate(PHONE_MOUKALA, code, { motDePasse: 'court' }).expect(400);
      expect(await prisma.parentAccount.count()).toBe(0);
      await activate(PHONE_MOUKALA, code).expect(201); // le code n'avait pas été consommé par les refus
      const info = await request(app.getHttpServer()).get('/portal/consent-info').expect(200);
      expect(info.body.version).toBe('2026-09-v1');
    });

    it('un code faux ne dit jamais si le numéro existe, et se brûle après cinq essais', async () => {
      const s = await school();
      const { code } = (await post(`/parent-accounts/guardians/${s.moukala.id}/activation-code`, {}).expect(201)).body;
      const unknown = await activate('242069999999', 'AAAA-BBBB').expect(401);
      const wrong = await activate(PHONE_MOUKALA, 'AAAA-BBBB').expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
      for (let i = 0; i < 4; i += 1) await activate(PHONE_MOUKALA, 'CCCC-DDDD').expect(401);
      await activate(PHONE_MOUKALA, code).expect(401); // brûlé : le bon code ne suffit plus
      expect(await prisma.parentAccount.count()).toBe(0);
      // Le secrétariat en remet un nouveau.
      const fresh = (await post(`/parent-accounts/guardians/${s.moukala.id}/activation-code`, {}).expect(201)).body;
      await activate(PHONE_MOUKALA, fresh.code).expect(201);
    });

    it('un code expiré ne fonctionne plus', async () => {
      const s = await school();
      const { code } = (await post(`/parent-accounts/guardians/${s.moukala.id}/activation-code`, {}).expect(201)).body;
      await prisma.parentActivationCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await activate(PHONE_MOUKALA, code).expect(401);
    });

    it('la durée de validité vient du paramètre de l’école, pas du code', async () => {
      const s = await school();
      await prisma.school.updateMany({ data: { parentCodeValiditeJours: 1 } });
      const res = (await post(`/parent-accounts/guardians/${s.moukala.id}/activation-code`, {}).expect(201)).body;
      const hours = (new Date(res.expireLe).getTime() - Date.now()) / 3600000;
      expect(hours).toBeGreaterThan(23);
      expect(hours).toBeLessThan(25);
    });

    it('un nouveau code réinitialise le mot de passe oublié et ferme les anciennes sessions', async () => {
      const s = await school();
      const first = await activeParent(s.moukala.id, PHONE_MOUKALA, 'AncienMotDePasse1');
      await get('/portal/me', first).expect(200);
      const { code } = (await post(`/parent-accounts/guardians/${s.moukala.id}/activation-code`, {}).expect(201)).body;
      await activate(PHONE_MOUKALA, code, { motDePasse: 'NouveauMotDePasse1' }).expect(201);
      await portalPost('/portal/login', { telephone: PHONE_MOUKALA, motDePasse: 'AncienMotDePasse1' }).expect(401);
      await portalPost('/portal/login', { telephone: PHONE_MOUKALA, motDePasse: 'NouveauMotDePasse1' }).expect(201);
      expect(await prisma.parentConsent.count()).toBe(2); // une acceptation par activation
      expect(await prisma.parentAccount.count()).toBe(1);
    });
  });

  describe('connexion et session', () => {
    it('refuse un mauvais mot de passe sans rien révéler, verrouille après cinq échecs, respecte la désactivation', async () => {
      const s = await school();
      await activeParent(s.moukala.id, PHONE_MOUKALA);
      const bad = await portalPost('/portal/login', { telephone: PHONE_MOUKALA, motDePasse: 'faux' }).expect(401);
      const unknown = await portalPost('/portal/login', { telephone: '242069999999', motDePasse: 'faux' }).expect(401);
      expect(bad.body.message).toBe(unknown.body.message);
      for (let i = 0; i < 4; i += 1) await portalPost('/portal/login', { telephone: PHONE_MOUKALA, motDePasse: 'faux' }).expect(401);
      await portalPost('/portal/login', { telephone: PHONE_MOUKALA, motDePasse: 'MotDePasse123' }).expect(403); // verrouillé

      await prisma.parentAccount.updateMany({ data: { verrouilleJusqua: null, tentativesEchecsConnexion: 0 } });
      const ok = (await portalPost('/portal/login', { telephone: PHONE_MOUKALA, motDePasse: 'MotDePasse123' }).expect(201)).body;
      await get('/portal/me', ok.accessToken).expect(200);

      // Désactivé : le jeton en cours tombe aussitôt et la connexion est refusée.
      await post(`/parent-accounts/guardians/${s.moukala.id}/deactivate`, {}).expect(201);
      await get('/portal/me', ok.accessToken).expect(401);
      await portalPost('/portal/login', { telephone: PHONE_MOUKALA, motDePasse: 'MotDePasse123' }).expect(403);
      await post(`/parent-accounts/guardians/${s.moukala.id}/reactivate`, {}).expect(201);
      await portalPost('/portal/login', { telephone: PHONE_MOUKALA, motDePasse: 'MotDePasse123' }).expect(201);
      await post(`/parent-accounts/guardians/${s.zola.id}/deactivate`, {}).expect(404); // pas de compte
    });

    it('renouvelle la session avec le cookie, la ferme à la déconnexion, et change le mot de passe', async () => {
      const s = await school();
      await activeParent(s.moukala.id, PHONE_MOUKALA);
      const agent = request.agent(app.getHttpServer());
      const login = await agent.post('/portal/login').send({ telephone: PHONE_MOUKALA, motDePasse: 'MotDePasse123' }).expect(201);
      const refreshed = await agent.post('/portal/refresh').expect(201);
      expect(refreshed.body.accessToken).toBeDefined();
      await get('/portal/me', refreshed.body.accessToken).expect(200);
      await agent.post('/portal/logout').expect(201);
      await agent.post('/portal/refresh').expect(401);

      await patch('/portal/change-password', { ancienMotDePasse: 'faux', nouveauMotDePasse: 'AutreMotDePasse1' }, login.body.accessToken).expect(401);
      await patch('/portal/change-password', { ancienMotDePasse: 'MotDePasse123', nouveauMotDePasse: 'MotDePasse123' }, login.body.accessToken).expect(403);
      await patch('/portal/change-password', { ancienMotDePasse: 'MotDePasse123', nouveauMotDePasse: 'AutreMotDePasse1' }, login.body.accessToken).expect(200);
      await portalPost('/portal/login', { telephone: PHONE_MOUKALA, motDePasse: 'AutreMotDePasse1' }).expect(201);
    });
  });

  describe('isolation (RV08)', () => {
    it('un parent ne voit que ses enfants, jamais ceux d’une autre famille', async () => {
      const s = await school();
      const moukala = await activeParent(s.moukala.id, PHONE_MOUKALA);
      const zola = await activeParent(s.zola.id, PHONE_ZOLA);

      const me = (await get('/portal/me', moukala).expect(200)).body;
      expect(me.enfants.map((e: { prenom: string }) => e.prenom).sort()).toEqual(['Alice', 'Brice']);
      expect(me.enfants[0]).toMatchObject({ classe: 'CM2 A', anneeScolaire: '2026-2027' });
      const meZola = (await get('/portal/me', zola).expect(200)).body;
      expect(meZola.enfants.map((e: { prenom: string }) => e.prenom)).toEqual(['Carine']);

      // Chaque route de données refuse (404) l'enfant d'une autre famille, et un identifiant inconnu.
      for (const section of ['timetable', 'attendance', 'finance']) {
        await get(`/portal/children/${s.carine.student.id}/${section}`, moukala).expect(404);
        await get(`/portal/children/${s.alice.student.id}/${section}`, zola).expect(404);
        await get(`/portal/children/inconnu/${section}`, moukala).expect(404);
        await get(`/portal/children/${s.alice.student.id}/${section}`, moukala).expect(200);
      }
    });

    it('un jeton du personnel n’ouvre pas le portail, et un jeton de parent n’ouvre aucune route du personnel', async () => {
      const s = await school();
      const parent = await activeParent(s.moukala.id, PHONE_MOUKALA);

      await get('/portal/me').expect(401); // jeton du personnel
      await request(app.getHttpServer()).get('/portal/me').expect(401);
      await get('/portal/me', 'jeton-quelconque').expect(401);

      // Y compris les routes qui n'exigent qu'un utilisateur connecté, sans permission particulière.
      for (const path of ['/auth/me', '/students', `/students/${s.carine.student.id}`, '/rooms', '/school', '/academic-years', '/classes', '/absence-reasons', `/students/${s.carine.student.id}/financial-status`, `/payments?studentId=${s.carine.student.id}`, `/attendance/day?date=${today}`, '/timetables', '/teachers']) {
        const res = await get(path, parent);
        expect([401, 403]).toContain(res.status);
      }
      await post('/payments', { invoiceLineId: 'x', montant: 1 }, parent).expect(401);
      await post('/attendance/calls', { entryId: 'x', date: today, absences: [] }, parent).expect(401);
    });

    it('le portail est en lecture seule : aucune route d’écriture (hors mot de passe)', async () => {
      const s = await school();
      const parent = await activeParent(s.moukala.id, PHONE_MOUKALA);
      for (const path of [`/portal/children/${s.alice.student.id}/attendance`, `/portal/children/${s.alice.student.id}/finance`, '/portal/me']) {
        await post(path, {}, parent).expect(404);
        await patch(path, {}, parent).expect(404);
        await request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${parent}`).expect(404);
      }
    });

    it('retirer l’accès d’un responsable pour un enfant le masque, sans toucher aux autres responsables ni aux autres enfants', async () => {
      const s = await school();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const moukala = await activeParent(s.moukala.id, PHONE_MOUKALA);
      const ndinga = await activeParent(s.ndinga.id, PHONE_NDINGA);
      const link = await prisma.studentGuardian.findFirstOrThrow({ where: { guardianId: s.moukala.id, studentId: s.brice.student.id } });

      await patch(`/parent-accounts/links/${link.id}/access`, { acces: false, motif: '' }, dir).expect(400); // motif obligatoire
      await patch(`/parent-accounts/links/${link.id}/access`, { acces: false, motif: 'Décision de justice du 12 septembre' }, dir).expect(200);

      const me = (await get('/portal/me', moukala).expect(200)).body;
      expect(me.enfants.map((e: { prenom: string }) => e.prenom)).toEqual(['Alice']); // Brice a disparu
      await get(`/portal/children/${s.brice.student.id}/attendance`, moukala).expect(404);
      await get(`/portal/children/${s.brice.student.id}/finance`, moukala).expect(404);
      await get(`/portal/children/${s.alice.student.id}/finance`, moukala).expect(200); // ses autres enfants restent accessibles
      // L'autre responsable de Brice garde son accès.
      await get(`/portal/children/${s.brice.student.id}/finance`, ndinga).expect(200);

      const listed = (await get('/parent-accounts').expect(200)).body.find((g: { id: string }) => g.id === s.moukala.id);
      expect(listed.enfants.find((e: { studentId: string }) => e.studentId === s.brice.student.id)).toMatchObject({ accesPortail: false, accesMotif: 'Décision de justice du 12 septembre' });

      // Rétablissable, avec motif.
      await patch(`/parent-accounts/links/${link.id}/access`, { acces: true, motif: 'Décision levée' }, dir).expect(200);
      await get(`/portal/children/${s.brice.student.id}/finance`, moukala).expect(200);
    });
  });

  describe('ce que voit le parent', () => {
    it('emploi du temps de la classe de l’enfant, sans les motifs internes ni les autres classes', async () => {
      const s = await school();
      const parent = await activeParent(s.moukala.id, PHONE_MOUKALA);
      // Un changement ponctuel hier : le parent voit qu'un enseignant remplace, pas le motif.
      const entry = await prisma.timetableEntry.findFirstOrThrow({ where: { classId: s.klassA.id, jourSemaine: weekdayOf(yesterday) } });
      const other = (await post('/teachers', { nom: 'Okemba', prenom: 'Jean' })).body;
      await post(`/timetable-entries/${entry.id}/exceptions`, { date: yesterday, type: 'REMPLACEE', motif: 'Deuil dans la famille', replacementTeacherId: other.id }).expect(201);

      const week = (await get(`/portal/children/${s.alice.student.id}/timetable?date=${yesterday}`, parent).expect(200)).body;
      expect(week.classe).toBe('CM2 A');
      // Hier : la seule séance de CM2 A (9h), jamais celle de CM2 B prévue à 8h le même jour.
      const day = week.jours.find((j: { date: string }) => j.date === yesterday);
      expect(day.seances).toHaveLength(1);
      expect(day.seances[0].heureDebut).toBe('09:00');
      const all = week.jours.flatMap((j: { seances: unknown[] }) => j.seances);
      const replaced = all.find((x: { statut: string }) => x.statut === 'REMPLACEE');
      expect(replaced).toMatchObject({ matiere: 'Mathématiques', enseignant: 'Jean Okemba' });
      expect(JSON.stringify(week)).not.toContain('Deuil');
      expect(JSON.stringify(week)).not.toContain('motif');
      await get(`/portal/children/${s.alice.student.id}/timetable?date=demain`, parent).expect(400);
    });

    it('absences et retards de l’enfant avec le statut du justificatif, sans données internes', async () => {
      const s = await school();
      const parent = await activeParent(s.moukala.id, PHONE_MOUKALA);
      const data = (await get(`/portal/children/${s.alice.student.id}/attendance`, parent).expect(200)).body;
      expect(data.compteurs).toMatchObject({ absences: 1, excusees: 1, nonJustifiees: 0 });
      expect(data.lignes).toHaveLength(1);
      expect(data.lignes[0]).toMatchObject({ matiere: 'Mathématiques', statut: 'ABSENT', justificatif: { statut: 'ACCEPTEE', motif: 'Maladie' } });
      const raw = JSON.stringify(data);
      for (const internal of ['corrections', 'Appel saisi après coup', 'Ngoma', 'recordId', 'studentId']) expect(raw).not.toContain(internal);
      const brice = (await get(`/portal/children/${s.brice.student.id}/attendance`, parent).expect(200)).body;
      expect(brice.lignes).toEqual([]);
    });

    it('situation financière et reçus, réduits à ce qu’un parent doit voir', async () => {
      const s = await school();
      const parent = await activeParent(s.moukala.id, PHONE_MOUKALA);
      const data = (await get(`/portal/children/${s.alice.student.id}/finance`, parent).expect(200)).body;
      expect(data.situation).toMatchObject({ montantFacture: 45000, montantPaye: 20000, montantRestant: 25000 });
      expect(data.paiements).toHaveLength(1);
      expect(data.paiements[0]).toMatchObject({ numeroRecu: 'REC-000001', montant: 20000, statut: 'VALIDE', modePaiement: 'ESPECES' });
      const raw = JSON.stringify(data);
      for (const internal of ['recuParUser', 'verificationToken', 'schoolId', 'invoiceLineId', 'annuleParUser']) expect(raw).not.toContain(internal);
      // Un enfant sans facture émise : situation neutre, pas d'erreur.
      const brice = (await get(`/portal/children/${s.brice.student.id}/finance`, parent).expect(200)).body;
      expect(brice.paiements).toEqual([]);
    });
  });

  describe('journal d’audit', () => {
    it('trace le code, l’activation, la connexion et le retrait d’accès, sans jamais le code ni le mot de passe', async () => {
      const s = await school();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const { code } = (await post(`/parent-accounts/guardians/${s.moukala.id}/activation-code`, {}).expect(201)).body;
      await activate(PHONE_MOUKALA, code).expect(201);
      await portalPost('/portal/login', { telephone: PHONE_MOUKALA, motDePasse: 'MotDePasse123' }).expect(201);
      const link = await prisma.studentGuardian.findFirstOrThrow({ where: { guardianId: s.moukala.id } });
      await patch(`/parent-accounts/links/${link.id}/access`, { acces: false, motif: 'Test' }, dir).expect(200);
      await post(`/parent-accounts/guardians/${s.moukala.id}/deactivate`, {}).expect(201);

      const logs = await prisma.auditLog.findMany();
      const actions = logs.map((l) => l.action);
      expect(actions).toEqual(expect.arrayContaining(['PARENT_CODE_GENERATE', 'PARENT_ACCOUNT_ACTIVATE', 'PARENT_LOGIN_SUCCESS', 'PARENT_LINK_ACCESS_REVOKE', 'PARENT_ACCOUNT_DEACTIVATE']));
      const raw = JSON.stringify(logs);
      expect(raw).not.toContain(code);
      expect(raw).not.toContain('MotDePasse123');
    });
  });
});

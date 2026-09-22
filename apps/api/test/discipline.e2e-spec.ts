import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PUSH_SENDER } from '../src/notifications/push-sender.interface';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays } from '../src/timetable/timetable.util';
import { CONSENT_VERSION } from '../src/parent-portal/parent-auth.util';
import type { FakePushSender } from './utils/fake-push-sender';

/**
 * Lot 20 : discipline. Portée d'un enseignant (ses classes, ses signalements), verrouillage, décision réservée à la
 * Direction, sanction invisible du parent avant publication, portail en liste blanche, alerte générique, journal sans
 * aucun texte sensible.
 */
describe('Discipline (e2e, Lot 20)', () => {
  jest.setTimeout(60000);
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
  const SECRET_TEXT = 'Il a frappé un camarade dans la cour pendant la récréation';
  const FAMILY_TEXT = 'Retenue mercredi après les cours';

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

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string, motDePasse: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, motDePasse }).expect(201);
    return res.body.accessToken;
  }
  const get = (path: string, t = admin) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const post = (path: string, t = admin, body: object = {}) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${t}`).send(body);
  const patch = (path: string, t: string, body: object) =>
    request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${t}`).send(body);
  const put = (path: string, t: string, body: object) =>
    request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${t}`).send(body);

  async function tokenFor(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(prisma, sch.id, roleCode, { email });
    return { user, token: await login(user.email, motDePasse) };
  }

  interface World {
    klassA: { id: string };
    klassB: { id: string };
    alice: { id: string };
    brice: { id: string };
    carine: { id: string };
    diane: { id: string };
    teacherA: string;
    teacherB: string;
    incidentType: string;
    praiseType: string;
    sanctionType: string;
    moukala: { id: string };
    zola: { id: string };
    prof: string;
    profB: string;
    surv: string;
    dir: string;
  }

  /** Classes A (Alice, Brice) et B (Carine), deux enseignants avec compte, catalogues, deux familles. */
  async function world(): Promise<World> {
    const section = (await post('/sections', admin, { code: 'FR', nom: 'Francophone' })).body;
    const cycle = (await post('/cycles', admin, { sectionId: section.id, code: 'PRIM', nom: 'Primaire' })).body;
    const level = (await post('/levels', admin, { cycleId: cycle.id, code: 'CM2', nom: 'CM2' })).body;
    const year = (
      await post('/academic-years', admin, { libelle: '2026-2027', dateDebut: addDays(today, -120), dateFin: addDays(today, 200) })
    ).body;
    await post(`/academic-years/${year.id}/activate`, admin).expect(201);
    const klassA = (await post('/classes', admin, { levelId: level.id, academicYearId: year.id, nom: 'CM2 A' })).body;
    const klassB = (await post('/classes', admin, { levelId: level.id, academicYearId: year.id, nom: 'CM2 B' })).body;
    const math = (await post('/subjects', admin, { code: 'MATH', nom: 'Mathématiques' })).body;
    await put(`/subjects/${math.id}/levels`, admin, { levels: [{ levelId: level.id }] }).expect(200);
    const tA = (await post('/teachers', admin, { nom: 'Ngoma', prenom: 'Paul' })).body;
    const tB = (await post('/teachers', admin, { nom: 'Okemba', prenom: 'Jean' })).body;
    await post('/assignments', admin, { classId: klassA.id, subjectId: math.id, teacherId: tA.id }).expect(201);
    await post('/assignments', admin, { classId: klassB.id, subjectId: math.id, teacherId: tB.id }).expect(201);

    const prof = await tokenFor('ENSEIGNANT', 'prof@test.local');
    const profB = await tokenFor('ENSEIGNANT', 'profb@test.local');
    await prisma.teacher.update({ where: { id: tA.id }, data: { userId: prof.user.id } });
    await prisma.teacher.update({ where: { id: tB.id }, data: { userId: profB.user.id } });
    const surv = await tokenFor('SURVEILLANT', 'surv@test.local');
    const dir = await tokenFor('DIRECTION', 'dir@test.local');

    const sch = await prisma.school.findFirstOrThrow();
    let i = 0;
    const mk = async (nom: string, prenom: string, classId: string | null) => {
      i += 1;
      const student = await prisma.student.create({
        data: { schoolId: sch.id, matricule: `D${i}`, nom, prenom, sexe: 'F', dateNaissance: new Date('2015-01-01') },
      });
      if (classId) {
        await prisma.enrollment.create({
          data: {
            schoolId: sch.id,
            studentId: student.id,
            classId,
            academicYearId: year.id,
            numero: `INS-D${i}`,
            type: 'INSCRIPTION',
          },
        });
      }
      return student;
    };
    const alice = await mk('Moukala', 'Alice', klassA.id);
    const brice = await mk('Moukala', 'Brice', klassA.id);
    const carine = await mk('Zola', 'Carine', klassB.id);
    const diane = await mk('Nzila', 'Diane', null); // aucune inscription

    const guardian = async (nom: string, tel: string, studentId: string) => {
      const g = await prisma.guardian.create({ data: { schoolId: sch.id, nom, prenom: 'Parent', telephone: tel } });
      await prisma.studentGuardian.create({ data: { studentId, guardianId: g.id, lien: 'Mère' } });
      return g;
    };
    const moukala = await guardian('Moukala', '242060000001', alice.id);
    const zola = await guardian('Zola', '242060000002', carine.id);

    const incidentType = (await post('/discipline/types', admin, { nature: 'INCIDENT', nom: 'Bagarre' }).expect(201)).body.id;
    const praiseType = (await post('/discipline/types', admin, { nature: 'VALORISATION', nom: 'Félicitations' }).expect(201)).body.id;
    const sanctionType = (await post('/discipline/sanction-types', admin, { nom: 'Retenue' }).expect(201)).body.id;
    return {
      klassA, klassB, alice, brice, carine, diane,
      teacherA: tA.id, teacherB: tB.id, incidentType, praiseType, sanctionType, moukala, zola,
      prof: prof.token, profB: profB.token, surv: surv.token, dir: dir.token,
    };
  }

  const incident = (w: World, studentId: string, over: object = {}) => ({
    studentId,
    nature: 'INCIDENT',
    typeId: w.incidentType,
    dateFaits: today,
    gravite: 'MOYEN',
    description: SECRET_TEXT,
    ...over,
  });

  async function parentToken(guardianId: string, telephone: string) {
    const { body } = await post(`/parent-accounts/guardians/${guardianId}/activation-code`).expect(201);
    const res = await request(app.getHttpServer())
      .post('/portal/activate')
      .send({ telephone, code: body.code, motDePasse: 'MotDePasse123', consentement: true, versionPolitique: CONSENT_VERSION })
      .expect(201);
    return res.body.accessToken as string;
  }
  const pget = (path: string, t: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const ppost = (path: string, t: string) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${t}`).send({});

  /** Un incident d'Alice signalé par son enseignant, sanction décidée par la Direction. */
  async function withSanction(w: World, publish = false) {
    const record = (await post('/discipline/records', w.prof, incident(w, w.alice.id)).expect(201)).body;
    const sanction = (
      await post(`/discipline/records/${record.id}/sanctions`, w.dir, {
        typeId: w.sanctionType,
        dateDebut: today,
        messageFamille: FAMILY_TEXT,
      }).expect(201)
    ).body;
    if (publish) await post(`/discipline/sanctions/${sanction.id}/publier`, w.dir).expect(201);
    return { record, sanction };
  }

  // ------------------------------------------------------------------ catalogues

  describe('catalogues', () => {
    it('sont vides au départ, gérés par la pédagogie, sans doublon, et un type désactivé n’est plus proposé', async () => {
      const w = await world();
      const types = (await get('/discipline/types', w.prof).expect(200)).body as Array<{ nom: string }>;
      expect(types.map((t) => t.nom).sort()).toEqual(['Bagarre', 'Félicitations']);
      await post('/discipline/types', admin, { nature: 'INCIDENT', nom: 'Bagarre' }).expect(409);
      await post('/discipline/sanction-types', admin, { nom: 'Retenue' }).expect(409);
      await post('/discipline/types', w.prof, { nature: 'INCIDENT', nom: 'Vol' }).expect(403);
      await post('/discipline/sanction-types', w.surv, { nom: 'Blâme' }).expect(403);
      await patch(`/discipline/types/${w.incidentType}`, admin, { actif: false }).expect(200);
      const res = await post('/discipline/records', w.prof, incident(w, w.alice.id)).expect(400);
      expect(res.body.message).toMatch(/désactivé/);
    });
  });

  // ------------------------------------------------------------------ droits et portée

  describe('droits et portée', () => {
    it('ni l’Administrateur, ni l’Auditeur, ni le comptable, ni sans jeton', async () => {
      const w = await world();
      const aud = await tokenFor('AUDITEUR', 'aud@test.local');
      const cpt = await tokenFor('COMPTABLE', 'cpt@test.local');
      for (const t of [admin, aud.token, cpt.token]) {
        await get('/discipline/records', t).expect(403);
        await post('/discipline/records', t, incident(w, w.alice.id)).expect(403);
        await get(`/discipline/students/${w.alice.id}/history`, t).expect(403);
        await get('/discipline/convocations', t).expect(403);
      }
      await request(app.getHttpServer()).get('/discipline/records').expect(401);
    });

    it('un enseignant ne signale que pour ses classes ; la vie scolaire et la Direction pour toute l’école', async () => {
      const w = await world();
      await post('/discipline/records', w.prof, incident(w, w.alice.id)).expect(201);
      const res = await post('/discipline/records', w.prof, incident(w, w.carine.id)).expect(403);
      expect(res.body.message).toMatch(/vos classes/);
      await post('/discipline/records', w.profB, incident(w, w.carine.id)).expect(201);
      await post('/discipline/records', w.surv, incident(w, w.carine.id)).expect(201);
      await post('/discipline/records', w.dir, incident(w, w.alice.id)).expect(201);
    });

    it('un enseignant sans fiche ou inactif est refusé', async () => {
      const w = await world();
      const orphan = await tokenFor('ENSEIGNANT', 'sansfiche@test.local');
      await post('/discipline/records', orphan.token, incident(w, w.alice.id)).expect(403);
      await get('/discipline/records', orphan.token).expect(403);
      await prisma.teacher.update({ where: { id: w.teacherA }, data: { statut: 'INACTIF' } });
      await post('/discipline/records', w.prof, incident(w, w.alice.id)).expect(403);
    });

    it('les sélecteurs de l’enseignant se limitent à ses classes', async () => {
      const w = await world();
      const mine = (await get('/discipline/my-classes', w.prof).expect(200)).body as Array<{ id: string }>;
      expect(mine.map((c) => c.id)).toEqual([w.klassA.id]);
      const all = (await get('/discipline/my-classes', w.surv).expect(200)).body as Array<{ id: string }>;
      expect(all).toHaveLength(2);
      const students = (await get(`/discipline/classes/${w.klassA.id}/students`, w.prof).expect(200)).body as Array<{ id: string }>;
      expect(students.map((s) => s.id).sort()).toEqual([w.alice.id, w.brice.id].sort());
      await get(`/discipline/classes/${w.klassB.id}/students`, w.prof).expect(403);
    });

    it('les droits sont attribués comme prévu, et la décision est un droit réservé', async () => {
      const rows = await prisma.rolePermission.findMany({
        where: { permission: { code: { startsWith: 'DISCIPLINE_' } } },
        include: { role: true, permission: true },
      });
      const by = (code: string) => rows.filter((r) => r.permission.code === code).map((r) => r.role.code).sort();
      expect(by('DISCIPLINE_REPORT')).toEqual(['DIRECTION', 'ENSEIGNANT', 'SURVEILLANT']);
      expect(by('DISCIPLINE_READ')).toEqual(['DIRECTION', 'SURVEILLANT']);
      expect(by('DISCIPLINE_CONVOKE')).toEqual(['DIRECTION', 'SURVEILLANT']);
      expect(by('DISCIPLINE_DECIDE')).toEqual(['DIRECTION']);
      const sql = readFileSync(
        join(__dirname, '..', 'prisma', 'migrations', '20260925080000_lot20_discipline', 'migration.sql'),
        'utf8',
      );
      for (const code of ['DISCIPLINE_REPORT', 'DISCIPLINE_READ', 'DISCIPLINE_CONVOKE', 'DISCIPLINE_DECIDE']) {
        expect(sql).toContain(code);
      }
      expect(sql).toContain('ON CONFLICT');
      // Droit réservé : l'Administrateur ne peut ni l'accorder ni le retirer à la Direction.
      const roles = (await get('/roles', admin).expect(200)).body as Array<{ id: string; code: string; permissions: string[] }>;
      const surveillant = roles.find((r) => r.code === 'SURVEILLANT')!;
      await put(`/roles/${surveillant.id}/permissions`, admin, {
        permissionCodes: [...surveillant.permissions, 'DISCIPLINE_DECIDE'],
      }).expect(403);
      const direction = roles.find((r) => r.code === 'DIRECTION')!;
      await put(`/roles/${direction.id}/permissions`, admin, {
        permissionCodes: direction.permissions.filter((c) => c !== 'DISCIPLINE_DECIDE'),
      }).expect(403);
      const adminRole = roles.find((r) => r.code === 'ADMINISTRATEUR')!;
      expect(adminRole.permissions.some((c) => c.startsWith('DISCIPLINE_'))).toBe(false);
    });
  });

  // ------------------------------------------------------------------ signalements

  describe('signalements', () => {
    it('valide la nature, la gravité, la description, la date et l’inscription', async () => {
      const w = await world();
      const bad = (over: object) => post('/discipline/records', w.dir, incident(w, w.alice.id, over));
      await bad({ gravite: undefined }).expect(400);
      await bad({ description: '' }).expect(400);
      await bad({ description: 'ab' }).expect(400);
      await bad({ dateFaits: addDays(today, 1) }).expect(400);
      await bad({ dateFaits: 'hier' }).expect(400);
      await bad({ typeId: w.praiseType }).expect(400); // nature différente
      await bad({ typeId: 'inconnu' }).expect(400);
      await bad({ nature: 'AUTRE' }).expect(400);
      const noEnrollment = await post('/discipline/records', w.dir, incident(w, w.diane.id)).expect(422);
      expect(noEnrollment.body.message).toMatch(/inscription active/);
      await post('/discipline/records', w.dir, incident(w, 'inconnu')).expect(404);
      // Un numéro de téléphone n'a rien à faire dans un dossier.
      const phone = await bad({ description: 'Appeler le père au 06 12 34 56 78 pour lui parler' }).expect(422);
      expect(phone.body.message).toMatch(/numéro de téléphone/);
      // Une valorisation n'exige ni gravité ni description.
      const praise = (
        await post('/discipline/records', w.prof, {
          studentId: w.alice.id,
          nature: 'VALORISATION',
          typeId: w.praiseType,
          dateFaits: today,
        }).expect(201)
      ).body;
      expect(praise.gravite).toBeNull();
      expect(praise.description).toBe('');
    });

    it('un enseignant ne relit que ses signalements, sans le message à la famille ni une sanction non publiée', async () => {
      const w = await world();
      const { record } = await withSanction(w);
      await post('/discipline/records', w.profB, incident(w, w.carine.id)).expect(201);
      const own = (await get('/discipline/records', w.prof).expect(200)).body as Array<{ id: string; sanctions: unknown[] }>;
      expect(own.map((r) => r.id)).toEqual([record.id]);
      expect(own[0].sanctions).toHaveLength(0); // sanction décidée, pas encore publiée
      const all = (await get('/discipline/records', w.surv).expect(200)).body as unknown[];
      expect(all).toHaveLength(2);
      const filtered = (await get(`/discipline/records?studentId=${w.carine.id}`, w.dir).expect(200)).body as unknown[];
      expect(filtered).toHaveLength(1);

      // Une fois publiée, l'enseignant voit le nom de la sanction mais jamais le message destiné à la famille.
      const sanction = await prisma.sanction.findFirstOrThrow();
      await post(`/discipline/sanctions/${sanction.id}/publier`, w.dir).expect(201);
      const after = (await get('/discipline/records', w.prof).expect(200)).body as Array<{ sanctions: Array<Record<string, unknown>> }>;
      expect(after[0].sanctions).toHaveLength(1);
      expect(after[0].sanctions[0].type).toBe('Retenue');
      expect(JSON.stringify(after)).not.toContain(FAMILY_TEXT);
      const full = (await get('/discipline/records', w.dir).expect(200)).body as Array<{ sanctions: Array<Record<string, unknown>> }>;
      expect(JSON.stringify(full)).toContain(FAMILY_TEXT);
    });

    it('l’auteur corrige le jour même ; ensuite seule la Direction, avec un motif et une révision conservée', async () => {
      const w = await world();
      const record = (await post('/discipline/records', w.prof, incident(w, w.alice.id)).expect(201)).body;
      await patch(`/discipline/records/${record.id}`, w.prof, { gravite: 'GRAVE' }).expect(200);
      expect(await prisma.disciplineRecordRevision.count()).toBe(0); // correction du jour : pas de révision
      await patch(`/discipline/records/${record.id}`, w.profB, { gravite: 'LEGER' }).expect(403); // pas l'auteur

      // Le jour de saisie est révolu : verrouillé pour l'auteur.
      await prisma.disciplineRecord.update({ where: { id: record.id }, data: { createdAt: new Date(Date.now() - 2 * 86400000) } });
      const locked = await patch(`/discipline/records/${record.id}`, w.prof, { gravite: 'LEGER' }).expect(403);
      expect(locked.body.message).toMatch(/verrouillé/);
      await patch(`/discipline/records/${record.id}`, w.dir, { gravite: 'LEGER' }).expect(400); // motif obligatoire
      await patch(`/discipline/records/${record.id}`, w.dir, { gravite: 'LEGER', motif: 'ab' }).expect(400);
      const res = await patch(`/discipline/records/${record.id}`, w.dir, {
        gravite: 'LEGER',
        description: 'Description corrigée par la Direction après entretien',
        motif: 'Précisions apportées par le témoin',
      }).expect(200);
      expect(res.body.gravite).toBe('LEGER');
      const revisions = await prisma.disciplineRecordRevision.findMany();
      expect(revisions).toHaveLength(1);
      expect(revisions[0].motif).toBe('Précisions apportées par le témoin');
      expect(revisions[0].avant).toMatchObject({ gravite: 'GRAVE', description: SECRET_TEXT });
      // Le surveillant ne corrige pas un signalement verrouillé.
      await patch(`/discipline/records/${record.id}`, w.surv, { gravite: 'MOYEN', motif: 'Erreur de saisie' }).expect(403);
    });

    it('classer sans suite, annuler : réservés à la Direction, avec motif', async () => {
      const w = await world();
      const r1 = (await post('/discipline/records', w.prof, incident(w, w.alice.id)).expect(201)).body;
      await post(`/discipline/records/${r1.id}/classer`, w.surv, { motif: 'Sans gravité' }).expect(403);
      await post(`/discipline/records/${r1.id}/classer`, w.dir, { motif: 'x' }).expect(400);
      await post(`/discipline/records/${r1.id}/classer`, w.dir, { motif: 'Sans gravité, réglé en classe' }).expect(201);
      // Un incident classé sans suite ne reçoit plus de sanction.
      await post(`/discipline/records/${r1.id}/sanctions`, w.dir, { typeId: w.sanctionType, dateDebut: today }).expect(409);
      await post(`/discipline/records/${r1.id}/annuler`, w.prof, { motif: 'Erreur de saisie' }).expect(403);
      await post(`/discipline/records/${r1.id}/annuler`, w.dir, { motif: 'Erreur de saisie' }).expect(201);
      await post(`/discipline/records/${r1.id}/annuler`, w.dir, { motif: 'Encore' }).expect(409);
      await patch(`/discipline/records/${r1.id}`, w.dir, { gravite: 'LEGER', motif: 'Correction' }).expect(409);
      await post(`/discipline/records/${r1.id}/sanctions`, w.dir, { typeId: w.sanctionType, dateDebut: today }).expect(409);
    });
  });

  // ------------------------------------------------------------------ sanctions et portail

  describe('sanctions', () => {
    it('seule la Direction décide, publie et annule', async () => {
      const w = await world();
      const record = (await post('/discipline/records', w.prof, incident(w, w.alice.id)).expect(201)).body;
      const body = { typeId: w.sanctionType, dateDebut: today, messageFamille: FAMILY_TEXT };
      for (const t of [w.prof, w.surv, admin]) {
        await post(`/discipline/records/${record.id}/sanctions`, t, body).expect(403);
      }
      await post(`/discipline/records/${record.id}/sanctions`, w.dir, { ...body, dateFin: addDays(today, -1) }).expect(400);
      await post(`/discipline/records/${record.id}/sanctions`, w.dir, { ...body, typeId: 'inconnu' }).expect(400);
      await post(`/discipline/records/${record.id}/sanctions`, w.dir, {
        ...body,
        messageFamille: 'Appelez le 06 12 34 56 78 vite',
      }).expect(422);
      const sanction = (await post(`/discipline/records/${record.id}/sanctions`, w.dir, body).expect(201)).body;
      expect((await prisma.disciplineRecord.findUniqueOrThrow({ where: { id: record.id } })).statut).toBe('TRAITE');
      for (const t of [w.prof, w.surv, admin]) {
        await post(`/discipline/sanctions/${sanction.id}/publier`, t).expect(403);
        await post(`/discipline/sanctions/${sanction.id}/annuler`, t, { motif: 'Erreur' }).expect(403);
        await get('/discipline/sanctions', t).expect(403);
      }
      await post(`/discipline/sanctions/${sanction.id}/publier`, w.dir).expect(201);
      await post(`/discipline/sanctions/${sanction.id}/publier`, w.dir).expect(409);
      // Impossible d'annuler le signalement tant qu'une sanction est publiée.
      await post(`/discipline/records/${record.id}/annuler`, w.dir, { motif: 'Erreur de saisie' }).expect(409);
      await post(`/discipline/sanctions/${sanction.id}/annuler`, w.dir, { motif: 'Décision retirée' }).expect(201);
      await post(`/discipline/sanctions/${sanction.id}/annuler`, w.dir, { motif: 'Encore' }).expect(409);
      // Plus aucune sanction : l'incident redevient ouvert.
      expect((await prisma.disciplineRecord.findUniqueOrThrow({ where: { id: record.id } })).statut).toBe('OUVERT');
      await post('/discipline/records', w.dir, { studentId: w.alice.id, nature: 'VALORISATION', typeId: w.praiseType, dateFaits: today }).expect(201);
      const praise = await prisma.disciplineRecord.findFirstOrThrow({ where: { nature: 'VALORISATION' } });
      await post(`/discipline/records/${praise.id}/sanctions`, w.dir, body).expect(400);
    });

    it('la Direction liste les sanctions à publier', async () => {
      const w = await world();
      await withSanction(w);
      const pending = (await get('/discipline/sanctions?statut=DECIDEE', w.dir).expect(200)).body as Array<{ eleve: { id: string }; messageFamille: string }>;
      expect(pending).toHaveLength(1);
      expect(pending[0].eleve.id).toBe(w.alice.id);
      expect((await get('/discipline/sanctions?statut=PUBLIEE', w.dir).expect(200)).body).toHaveLength(0);
      await get('/discipline/sanctions?statut=INCONNU', w.dir).expect(400);
    });
  });

  describe('portail des parents', () => {
    it('une sanction n’est visible qu’une fois publiée, puis « retirée » si elle est annulée', async () => {
      const w = await world();
      const parent = await parentToken(w.moukala.id, '242060000001');
      const { sanction } = await withSanction(w);
      const before = (await pget(`/portal/children/${w.alice.id}/discipline`, parent).expect(200)).body;
      expect(before.sanctions).toHaveLength(0);

      await post(`/discipline/sanctions/${sanction.id}/publier`, w.dir).expect(201);
      const shown = (await pget(`/portal/children/${w.alice.id}/discipline`, parent).expect(200)).body;
      expect(shown.sanctions).toEqual([
        { id: sanction.id, type: 'Retenue', dateDebut: today, dateFin: null, message: FAMILY_TEXT, retiree: false },
      ]);

      await post(`/discipline/sanctions/${sanction.id}/annuler`, w.dir, { motif: 'Décision retirée' }).expect(201);
      const withdrawn = (await pget(`/portal/children/${w.alice.id}/discipline`, parent).expect(200)).body;
      expect(withdrawn.sanctions[0].retiree).toBe(true);
    });

    it('une sanction annulée avant publication n’apparaît jamais', async () => {
      const w = await world();
      const parent = await parentToken(w.moukala.id, '242060000001');
      const { sanction } = await withSanction(w);
      await post(`/discipline/sanctions/${sanction.id}/annuler`, w.dir, { motif: 'Erreur de décision' }).expect(201);
      const view = (await pget(`/portal/children/${w.alice.id}/discipline`, parent).expect(200)).body;
      expect(view.sanctions).toHaveLength(0);
    });

    it('la réponse est une liste blanche : jamais la description, l’auteur, la gravité, l’incident ni un autre élève', async () => {
      const w = await world();
      const parent = await parentToken(w.moukala.id, '242060000001');
      const { record } = await withSanction(w, true);
      await post('/discipline/records', w.prof, incident(w, w.brice.id, { description: 'Incident concernant un autre élève' })).expect(201);
      await post('/discipline/records', w.prof, {
        studentId: w.alice.id, nature: 'VALORISATION', typeId: w.praiseType, dateFaits: today, description: 'Commentaire interne',
      }).expect(201);
      await post('/discipline/convocations', w.surv, {
        studentId: w.alice.id, recordId: record.id, dateRdv: new Date(Date.now() + 2 * 86400000).toISOString(), lieu: 'Bureau', objet: 'Entretien',
      }).expect(201);
      const body = (await pget(`/portal/children/${w.alice.id}/discipline`, parent).expect(200)).body;
      expect(Object.keys(body).sort()).toEqual(['convocations', 'sanctions', 'valorisations']);
      const text = JSON.stringify(body);
      for (const secret of [SECRET_TEXT, 'Bagarre', 'gravite', 'MOYEN', 'Ngoma', 'Paul', 'auteur', 'Brice', 'autre élève', 'Commentaire interne', record.id, 'recordId']) {
        expect(text).not.toContain(secret);
      }
      expect(Object.keys(body.sanctions[0]).sort()).toEqual(['dateDebut', 'dateFin', 'id', 'message', 'retiree', 'type']);
      expect(Object.keys(body.convocations[0]).sort()).toEqual(['accuseLe', 'annulee', 'dateRdv', 'id', 'issue', 'lieu', 'objet']);
      expect(body.valorisations).toHaveLength(1);
      expect(Object.keys(body.valorisations[0]).sort()).toEqual(['date', 'id', 'type']);
    });

    it('un parent n’accède jamais à l’enfant d’une autre famille ; le personnel n’ouvre pas le portail', async () => {
      const w = await world();
      const parent = await parentToken(w.moukala.id, '242060000001');
      await pget(`/portal/children/${w.carine.id}/discipline`, parent).expect(404);
      await request(app.getHttpServer()).get(`/portal/children/${w.alice.id}/discipline`).expect(401);
      await pget(`/portal/children/${w.alice.id}/discipline`, w.dir).expect(401);
      // Un accès retiré à ce responsable pour cet élève ferme aussi cet onglet.
      await prisma.studentGuardian.updateMany({ where: { guardianId: w.moukala.id }, data: { accesPortail: false } });
      await pget(`/portal/children/${w.alice.id}/discipline`, parent).expect(404);
    });

    it('les valorisations sont visibles sans alerte, une valorisation annulée disparaît', async () => {
      const w = await world();
      const parent = await parentToken(w.moukala.id, '242060000001');
      const praise = (
        await post('/discipline/records', w.prof, { studentId: w.alice.id, nature: 'VALORISATION', typeId: w.praiseType, dateFaits: today }).expect(201)
      ).body;
      await notifications.idle();
      expect((await pget(`/portal/children/${w.alice.id}/discipline`, parent).expect(200)).body.valorisations).toHaveLength(1);
      expect(await prisma.parentNotification.count({ where: { type: 'DISCIPLINE' } })).toBe(0);
      expect(push.sent).toHaveLength(0);
      await post(`/discipline/records/${praise.id}/annuler`, w.dir, { motif: 'Saisie par erreur' }).expect(201);
      expect((await pget(`/portal/children/${w.alice.id}/discipline`, parent).expect(200)).body.valorisations).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------ notification générique

  describe('alerte générique', () => {
    it('la publication d’une sanction prévient sans jamais dire de quoi il s’agit', async () => {
      const w = await world();
      const parent = await parentToken(w.moukala.id, '242060000001');
      await request(app.getHttpServer())
        .post('/portal/push/subscriptions')
        .set('Authorization', `Bearer ${parent}`)
        .send({ endpoint: 'https://push.example.test/d1', keys: { p256dh: 'clePublique', auth: 'secretAuth' } })
        .expect(201);
      const { sanction } = await withSanction(w);
      await notifications.idle();
      expect(push.sent).toHaveLength(0); // rien tant que la sanction n'est pas publiée
      await post(`/discipline/sanctions/${sanction.id}/publier`, w.dir).expect(201);
      await notifications.idle();
      expect(push.sent).toHaveLength(1);
      const body = push.sent[0].payload.body;
      expect(body).toBe('Un nouvel élément de vie scolaire est disponible pour Alice. Ouvrez l\'application pour le consulter.');
      for (const secret of ['Bagarre', 'Retenue', 'sanction', 'incident', FAMILY_TEXT, SECRET_TEXT]) {
        expect(body).not.toContain(secret);
        expect(push.sent[0].payload.title).not.toContain(secret);
      }
      const rows = await prisma.parentNotification.findMany({ where: { type: 'DISCIPLINE' } });
      expect(rows).toHaveLength(1);
      expect(rows[0].titre).toBe('Vie scolaire');
      for (const secret of ['Bagarre', 'Retenue', 'sanction', 'incident', FAMILY_TEXT]) expect(rows[0].corps).not.toContain(secret);
    });

    it('seuls les responsables de l’élève sont prévenus', async () => {
      const w = await world();
      const parentA = await parentToken(w.moukala.id, '242060000001');
      const parentB = await parentToken(w.zola.id, '242060000002');
      const { sanction } = await withSanction(w);
      await post(`/discipline/sanctions/${sanction.id}/publier`, w.dir).expect(201);
      await notifications.idle();
      const a = (await pget('/portal/notifications', parentA).expect(200)).body.notifications as unknown[];
      const b = (await pget('/portal/notifications', parentB).expect(200)).body.notifications as unknown[];
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(0);
    });

    it('un service push en panne ne fait pas échouer la publication', async () => {
      const w = await world();
      await parentToken(w.moukala.id, '242060000001');
      push.mode = 'throw';
      const { sanction } = await withSanction(w);
      await post(`/discipline/sanctions/${sanction.id}/publier`, w.dir).expect(201);
      await notifications.idle();
      expect((await prisma.sanction.findUniqueOrThrow({ where: { id: sanction.id } })).statut).toBe('PUBLIEE');
    });
  });

  // ------------------------------------------------------------------ convocations

  describe('convocations', () => {
    const inTwoDays = () => new Date(Date.now() + 2 * 86400000).toISOString();

    it('se créent par la vie scolaire, avec validation, et préviennent la famille sans détail', async () => {
      const w = await world();
      const parent = await parentToken(w.moukala.id, '242060000001');
      const body = { studentId: w.alice.id, dateRdv: inTwoDays(), lieu: 'Bureau de la vie scolaire', objet: 'Entretien avec la famille' };
      await post('/discipline/convocations', w.prof, body).expect(403);
      await post('/discipline/convocations', admin, body).expect(403);
      await post('/discipline/convocations', w.surv, { ...body, dateRdv: new Date(Date.now() - 3600000).toISOString() }).expect(400);
      await post('/discipline/convocations', w.surv, { ...body, dateRdv: 'demain' }).expect(400);
      await post('/discipline/convocations', w.surv, { ...body, lieu: 'Salle 06 12 34 56 78' }).expect(422);
      await post('/discipline/convocations', w.surv, { ...body, studentId: 'inconnu' }).expect(404);
      await post('/discipline/convocations', w.surv, { ...body, recordId: 'inconnu' }).expect(400);
      const other = (await post('/discipline/records', w.profB, incident(w, w.carine.id)).expect(201)).body;
      await post('/discipline/convocations', w.surv, { ...body, recordId: other.id }).expect(400); // autre élève
      await post('/discipline/convocations', w.dir, body).expect(201);
      await notifications.idle();
      const rows = await prisma.parentNotification.findMany({ where: { type: 'DISCIPLINE' } });
      expect(rows).toHaveLength(1);
      expect(rows[0].corps).not.toContain('Entretien');
      const view = (await pget(`/portal/children/${w.alice.id}/discipline`, parent).expect(200)).body;
      expect(view.convocations[0]).toMatchObject({ lieu: 'Bureau de la vie scolaire', objet: 'Entretien avec la famille', annulee: false, accuseLe: null });
    });

    it('le parent accuse réception (idempotent) ; annulée, elle ne s’accuse plus ; l’issue se pose une fois', async () => {
      const w = await world();
      const parent = await parentToken(w.moukala.id, '242060000001');
      const otherParent = await parentToken(w.zola.id, '242060000002');
      const c = (
        await post('/discipline/convocations', w.surv, { studentId: w.alice.id, dateRdv: inTwoDays(), lieu: 'Bureau', objet: 'Entretien' }).expect(201)
      ).body;
      await ppost(`/portal/children/${w.alice.id}/discipline/convocations/${c.id}/accuser`, otherParent).expect(404);
      const first = (await ppost(`/portal/children/${w.alice.id}/discipline/convocations/${c.id}/accuser`, parent).expect(201)).body;
      const second = (await ppost(`/portal/children/${w.alice.id}/discipline/convocations/${c.id}/accuser`, parent).expect(201)).body;
      expect(second.accuseLe).toBe(first.accuseLe);
      const stored = await prisma.disciplineConvocation.findUniqueOrThrow({ where: { id: c.id } });
      expect(stored.accuseParGuardianId).toBe(w.moukala.id);
      await ppost(`/portal/children/${w.alice.id}/discipline/convocations/inconnue/accuser`, parent).expect(404);
      await ppost(`/portal/children/${w.carine.id}/discipline/convocations/${c.id}/accuser`, parent).expect(404);

      await post(`/discipline/convocations/${c.id}/issue`, w.prof, { issue: 'PRESENT' }).expect(403);
      await post(`/discipline/convocations/${c.id}/issue`, w.surv, { issue: 'PEUT-ETRE' }).expect(400);
      await post(`/discipline/convocations/${c.id}/issue`, w.surv, { issue: 'PRESENT' }).expect(201);
      await post(`/discipline/convocations/${c.id}/issue`, w.surv, { issue: 'ABSENT' }).expect(409);

      const c2 = (
        await post('/discipline/convocations', w.surv, { studentId: w.alice.id, dateRdv: inTwoDays(), lieu: 'Bureau', objet: 'Suivi' }).expect(201)
      ).body;
      await post(`/discipline/convocations/${c2.id}/annuler`, w.surv, { motif: 'x' }).expect(400);
      await post(`/discipline/convocations/${c2.id}/annuler`, w.surv, { motif: 'Report du rendez-vous' }).expect(201);
      await post(`/discipline/convocations/${c2.id}/annuler`, w.surv, { motif: 'Encore' }).expect(409);
      await ppost(`/portal/children/${w.alice.id}/discipline/convocations/${c2.id}/accuser`, parent).expect(409);
      await post(`/discipline/convocations/${c2.id}/issue`, w.surv, { issue: 'PRESENT' }).expect(409);
      const view = (await pget(`/portal/children/${w.alice.id}/discipline`, parent).expect(200)).body;
      expect(view.convocations.find((x: { id: string }) => x.id === c2.id).annulee).toBe(true);
      const listed = (await get(`/discipline/convocations?studentId=${w.alice.id}`, w.surv).expect(200)).body as unknown[];
      expect(listed).toHaveLength(2);
    });
  });

  // ------------------------------------------------------------------ dossier d'un élève et journal

  describe('dossier et journal (RV11)', () => {
    it('le dossier d’un élève est réservé à la vie scolaire et à la Direction, et chaque ouverture est journalisée', async () => {
      const w = await world();
      await withSanction(w, true);
      await get(`/discipline/students/${w.alice.id}/history`, w.prof).expect(403);
      await get(`/discipline/students/${w.alice.id}/history`, admin).expect(403);
      await get(`/discipline/students/inconnu/history`, w.surv).expect(404);
      const history = (await get(`/discipline/students/${w.alice.id}/history`, w.surv).expect(200)).body;
      expect(history.signalements).toHaveLength(1);
      expect(history.signalements[0].description).toBe(SECRET_TEXT);
      expect(history.signalements[0].sanctions[0].messageFamille).toBe(FAMILY_TEXT);
      await get(`/discipline/students/${w.alice.id}/history`, w.dir).expect(200);
      const reads = await prisma.auditLog.findMany({ where: { action: 'DISCIPLINE_STUDENT_READ' } });
      expect(reads).toHaveLength(2);
      expect(reads[0].entiteId).toBe(w.alice.id);
    });

    it('le journal ne contient jamais la description, le message à la famille, le lieu ni l’objet d’une convocation', async () => {
      const w = await world();
      const { record, sanction } = await withSanction(w, true);
      await prisma.disciplineRecord.update({ where: { id: record.id }, data: { createdAt: new Date(Date.now() - 2 * 86400000) } });
      await patch(`/discipline/records/${record.id}`, w.dir, {
        description: 'Nouvelle description confidentielle',
        motif: 'Précisions du témoin',
      }).expect(200);
      await post('/discipline/convocations', w.surv, {
        studentId: w.alice.id, dateRdv: new Date(Date.now() + 2 * 86400000).toISOString(), lieu: 'Bureau confidentiel', objet: 'Objet confidentiel',
      }).expect(201);
      await post(`/discipline/sanctions/${sanction.id}/annuler`, w.dir, { motif: 'Décision retirée' }).expect(201);
      const rows = await prisma.auditLog.findMany({ where: { action: { startsWith: 'DISCIPLINE_' } } });
      const actions = rows.map((r) => r.action);
      for (const a of ['DISCIPLINE_RECORD_CREATE', 'DISCIPLINE_RECORD_UPDATE', 'DISCIPLINE_SANCTION_DECIDE', 'DISCIPLINE_SANCTION_PUBLISH', 'DISCIPLINE_SANCTION_CANCEL', 'DISCIPLINE_CONVOCATION_CREATE']) {
        expect(actions).toContain(a);
      }
      const dump = JSON.stringify(rows);
      for (const secret of [SECRET_TEXT, FAMILY_TEXT, 'Nouvelle description confidentielle', 'Bureau confidentiel', 'Objet confidentiel']) {
        expect(dump).not.toContain(secret);
      }
      // L'auteur de chaque action est bien identifié.
      expect(rows.every((r) => r.userId !== null)).toBe(true);
    });
  });
});

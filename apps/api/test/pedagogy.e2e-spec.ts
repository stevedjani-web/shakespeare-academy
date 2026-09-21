import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

/** Lot 7 : référentiel pédagogique et personnel (addendum v1.1, D52 à D56). */
describe('Vie scolaire, référentiel pédagogique (e2e, Lot 7)', () => {
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

  /** Section + cycle + niveau + année (2026-09-01 au 2027-07-15) + classe. */
  async function structure() {
    const section = (await post('/sections', { code: 'FR', nom: 'Francophone' })).body;
    const cycle = (await post('/cycles', { sectionId: section.id, code: 'PRIM', nom: 'Primaire' })).body;
    const level = (await post('/levels', { cycleId: cycle.id, code: 'CM2', nom: 'CM2' })).body;
    const level2 = (await post('/levels', { cycleId: cycle.id, code: 'CM1', nom: 'CM1' })).body;
    const year = (
      await post('/academic-years', {
        libelle: '2026-2027',
        dateDebut: '2026-09-01',
        dateFin: '2027-07-15',
      })
    ).body;
    const klass = (
      await post('/classes', { levelId: level.id, academicYearId: year.id, nom: 'CM2 A' })
    ).body;
    return { section, cycle, level, level2, year, klass };
  }

  describe('permissions', () => {
    it('le Secrétaire-caissier ne peut ni écrire ni lire les enseignants (403), mais lit les créneaux', async () => {
      const school = await prisma.school.findFirstOrThrow();
      const { user, motDePasse } = await createUserWithRole(prisma, school.id, 'SECRETAIRE_CAISSIER');
      const t = await login(user.email, motDePasse);

      await post('/rooms', { nom: 'Salle 1' }, t).expect(403);
      await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' }, t).expect(403);
      await get('/teachers', t).expect(403);
      await get('/pedagogy/summary', t).expect(403);
      await get('/time-slots', t).expect(200);
      await get('/rooms', t).expect(200);
    });

    it('la Direction et l’Administrateur ont PEDAGOGY_MANAGE', async () => {
      const school = await prisma.school.findFirstOrThrow();
      const { user, motDePasse } = await createUserWithRole(prisma, school.id, 'DIRECTION');
      const t = await login(user.email, motDePasse);
      await post('/rooms', { nom: 'Salle 1' }, t).expect(201);
      await post('/rooms', { nom: 'Salle 2' }).expect(201);
    });
  });

  describe('jours de classe (D52)', () => {
    it('vaut lundi à vendredi par défaut, et le samedi s’active par paramètre', async () => {
      const initial = await get('/pedagogy/settings').expect(200);
      expect(initial.body.joursClasse).toEqual([1, 2, 3, 4, 5]);

      const updated = await patch('/pedagogy/settings', { joursClasse: [6, 1, 2, 3, 4, 5] }).expect(200);
      expect(updated.body.joursClasse).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('refuse une liste vide, un jour hors 0-6 ou un doublon', async () => {
      await patch('/pedagogy/settings', { joursClasse: [] }).expect(400);
      await patch('/pedagogy/settings', { joursClasse: [7] }).expect(400);
      await patch('/pedagogy/settings', { joursClasse: [1, 1] }).expect(400);
    });

    it('journalise le changement (RG15)', async () => {
      await patch('/pedagogy/settings', { joursClasse: [1, 2, 3] }).expect(200);
      const log = await prisma.auditLog.findFirst({ where: { action: 'PEDAGOGY_SETTINGS_UPDATE' } });
      expect(log).not.toBeNull();
    });
  });

  describe('créneaux horaires (D52, D53)', () => {
    it('crée un créneau commun sans rien de préchargé', async () => {
      expect((await get('/time-slots').expect(200)).body).toEqual([]);
      const res = await post('/time-slots', { libelle: '1ère heure', heureDebut: '08:00', heureFin: '08:50' }).expect(201);
      expect(res.body.sectionId).toBeNull();
      expect(res.body.type).toBe('COURS');
    });

    it('refuse un format d’heure invalide et une fin avant le début', async () => {
      await post('/time-slots', { libelle: 'X', heureDebut: '8h', heureFin: '09:00' }).expect(400);
      await post('/time-slots', { libelle: 'X', heureDebut: '09:00', heureFin: '08:00' }).expect(400);
      await post('/time-slots', { libelle: 'X', heureDebut: '09:00', heureFin: '09:00' }).expect(400);
    });

    it('refuse un chevauchement dans la même grille (409) mais accepte deux créneaux qui se suivent', async () => {
      await post('/time-slots', { libelle: 'H1', heureDebut: '08:00', heureFin: '08:50' }).expect(201);
      const clash = await post('/time-slots', { libelle: 'H2', heureDebut: '08:30', heureFin: '09:20' }).expect(409);
      expect(clash.body.message).toContain('H1');
      await post('/time-slots', { libelle: 'H2', heureDebut: '08:50', heureFin: '09:40' }).expect(201);
    });

    it('autorise une grille propre à une section qui chevauche la grille commune', async () => {
      const { section } = await structure();
      await post('/time-slots', { libelle: 'Commun', heureDebut: '08:00', heureFin: '08:50' }).expect(201);
      await post('/time-slots', {
        sectionId: section.id,
        libelle: 'Section',
        heureDebut: '08:00',
        heureFin: '09:00',
      }).expect(201);

      const own = await get(`/time-slots?sectionId=${section.id}`).expect(200);
      expect(own.body).toHaveLength(1);
      const common = await get('/time-slots?sectionId=').expect(200);
      expect(common.body).toHaveLength(1);
      expect(common.body[0].libelle).toBe('Commun');
    });

    it('refuse une section inconnue (404)', async () => {
      await post('/time-slots', {
        sectionId: 'inconnue',
        libelle: 'X',
        heureDebut: '08:00',
        heureFin: '09:00',
      }).expect(404);
    });

    it('modifie et supprime un créneau, en revérifiant le chevauchement', async () => {
      const a = (await post('/time-slots', { libelle: 'H1', heureDebut: '08:00', heureFin: '08:50' })).body;
      await post('/time-slots', { libelle: 'H2', heureDebut: '09:00', heureFin: '09:50' }).expect(201);
      await patch(`/time-slots/${a.id}`, { heureFin: '09:30' }).expect(409);
      await patch(`/time-slots/${a.id}`, { heureFin: '08:55', type: 'PAUSE' }).expect(200);
      await del(`/time-slots/${a.id}`).expect(200);
      await del(`/time-slots/${a.id}`).expect(404);
    });
  });

  describe('salles', () => {
    it('crée, refuse un doublon insensible à la casse, désactive et supprime', async () => {
      const room = (await post('/rooms', { nom: 'Salle 1', capacite: 40 }).expect(201)).body;
      await post('/rooms', { nom: 'salle  1' }).expect(409);
      const off = await patch(`/rooms/${room.id}`, { actif: false }).expect(200);
      expect(off.body.actif).toBe(false);
      await del(`/rooms/${room.id}`).expect(200);
    });

    it('refuse une capacité nulle', async () => {
      await post('/rooms', { nom: 'S', capacite: 0 }).expect(400);
    });
  });

  describe('matières et niveaux (D54)', () => {
    it('crée une matière au code normalisé et refuse un doublon', async () => {
      const s = (await post('/subjects', { code: ' math ', nom: 'Mathématiques' }).expect(201)).body;
      expect(s.code).toBe('MATH');
      await post('/subjects', { code: 'Math', nom: 'Autre' }).expect(409);
    });

    it('associe une matière à des niveaux et remplace l’ensemble', async () => {
      const { level, level2 } = await structure();
      const s = (await post('/subjects', { code: 'MATH', nom: 'Mathématiques' })).body;

      await put(`/subjects/${s.id}/levels`, {
        levels: [{ levelId: level.id, minutesParSemaine: 240 }, { levelId: level2.id }],
      }).expect(200);
      const list = await get('/subjects').expect(200);
      expect(list.body[0].levels).toHaveLength(2);

      await put(`/subjects/${s.id}/levels`, { levels: [{ levelId: level.id }] }).expect(200);
      expect((await get('/subjects')).body[0].levels).toHaveLength(1);
      await put(`/subjects/${s.id}/levels`, { levels: [{ levelId: 'inconnu' }] }).expect(404);
    });

    it('refuse de supprimer une matière utilisée (409) et d’en retirer un niveau affecté', async () => {
      const { level, klass } = await structure();
      const s = (await post('/subjects', { code: 'MATH', nom: 'Mathématiques' })).body;
      await put(`/subjects/${s.id}/levels`, { levels: [{ levelId: level.id }] }).expect(200);
      await del(`/subjects/${s.id}`).expect(409);

      const t = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
      await post('/assignments', { classId: klass.id, subjectId: s.id, teacherId: t.id }).expect(201);
      const blocked = await put(`/subjects/${s.id}/levels`, { levels: [] }).expect(409);
      expect(blocked.body.message).toContain('affectations');

      const free = (await post('/subjects', { code: 'ART', nom: 'Arts' })).body;
      await del(`/subjects/${free.id}`).expect(200);
    });
  });

  describe('enseignants (D56)', () => {
    it('crée une fiche sans compte ni paie et refuse un homonyme exact', async () => {
      const t = (
        await post('/teachers', { nom: 'Ngoma', prenom: 'Paul', telephone: '060000001', email: 'paul@ecole.cg' }).expect(201)
      ).body;
      expect(t.statut).toBe('ACTIF');
      expect(t).not.toHaveProperty('salaire');
      await post('/teachers', { nom: 'NGOMA', prenom: 'paul' }).expect(409);
    });

    it('refuse un e-mail invalide', async () => {
      await post('/teachers', { nom: 'A', prenom: 'B', email: 'pas-un-email' }).expect(400);
    });

    it('enregistre les matières d’un enseignant et refuse une matière inconnue', async () => {
      const t = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
      const a = (await post('/subjects', { code: 'MATH', nom: 'Maths' })).body;
      const b = (await post('/subjects', { code: 'FR', nom: 'Français' })).body;
      await put(`/teachers/${t.id}/subjects`, { subjectIds: [a.id, b.id] }).expect(200);
      const one = await get(`/teachers/${t.id}`).expect(200);
      expect(one.body.subjects).toHaveLength(2);
      await put(`/teachers/${t.id}/subjects`, { subjectIds: ['inconnue'] }).expect(404);
    });

    it('désactive un enseignant', async () => {
      const t = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
      const res = await patch(`/teachers/${t.id}`, { statut: 'INACTIF' }).expect(200);
      expect(res.body.statut).toBe('INACTIF');
    });
  });

  describe('affectations enseignant × matière × classe', () => {
    async function setup() {
      const s = await structure();
      const math = (await post('/subjects', { code: 'MATH', nom: 'Maths' })).body;
      await put(`/subjects/${math.id}/levels`, { levels: [{ levelId: s.level.id }] });
      const teacher = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
      return { ...s, math, teacher };
    }

    it('affecte un enseignant à une matière d’une classe, et liste la grille de la classe', async () => {
      const { klass, math, teacher } = await setup();
      const before = await get(`/assignments/by-class/${klass.id}`).expect(200);
      expect(before.body.matieres).toHaveLength(1);
      expect(before.body.matieres[0].assignment).toBeNull();

      await post('/assignments', { classId: klass.id, subjectId: math.id, teacherId: teacher.id }).expect(201);
      const after = await get(`/assignments/by-class/${klass.id}`).expect(200);
      expect(after.body.matieres[0].assignment.teacher.nom).toBe('Ngoma');
    });

    it('refuse une matière non enseignée au niveau de la classe (422)', async () => {
      const { klass, teacher } = await setup();
      const other = (await post('/subjects', { code: 'ANG', nom: 'Anglais' })).body;
      const res = await post('/assignments', { classId: klass.id, subjectId: other.id, teacherId: teacher.id }).expect(422);
      expect(res.body.message).toContain('pas enseignée');
    });

    it('refuse un second enseignant sur la même classe et matière (RV01), mais permet de le remplacer', async () => {
      const { klass, math, teacher } = await setup();
      const other = (await post('/teachers', { nom: 'Ondze', prenom: 'Marie' })).body;
      const a = (await post('/assignments', { classId: klass.id, subjectId: math.id, teacherId: teacher.id })).body;
      const dup = await post('/assignments', { classId: klass.id, subjectId: math.id, teacherId: other.id }).expect(409);
      expect(dup.body.message).toContain('Ngoma');

      const changed = await patch(`/assignments/${a.id}`, { teacherId: other.id }).expect(200);
      expect(changed.body.teacherId).toBe(other.id);
      await del(`/assignments/${a.id}`).expect(200);
    });

    it('refuse d’affecter un enseignant inactif', async () => {
      const { klass, math, teacher } = await setup();
      await patch(`/teachers/${teacher.id}`, { statut: 'INACTIF' }).expect(200);
      await post('/assignments', { classId: klass.id, subjectId: math.id, teacherId: teacher.id }).expect(409);
    });

    it('filtre les affectations par enseignant', async () => {
      const { klass, math, teacher } = await setup();
      await post('/assignments', { classId: klass.id, subjectId: math.id, teacherId: teacher.id }).expect(201);
      expect((await get(`/assignments?teacherId=${teacher.id}`)).body).toHaveLength(1);
      expect((await get('/assignments?teacherId=autre')).body).toHaveLength(0);
    });
  });

  describe('trimestres et calendrier (D55)', () => {
    it('crée trois trimestres numérotés automatiquement, sans chevauchement', async () => {
      const { year } = await structure();
      const t1 = (
        await post('/terms', { academicYearId: year.id, libelle: 'Trimestre 1', dateDebut: '2026-09-01', dateFin: '2026-12-15' }).expect(201)
      ).body;
      const t2 = (
        await post('/terms', { academicYearId: year.id, libelle: 'Trimestre 2', dateDebut: '2027-01-05', dateFin: '2027-03-31' }).expect(201)
      ).body;
      expect([t1.ordre, t2.ordre]).toEqual([1, 2]);

      await post('/terms', { academicYearId: year.id, libelle: 'X', dateDebut: '2027-03-01', dateFin: '2027-04-10' }).expect(409);
      expect((await get(`/terms?academicYearId=${year.id}`)).body).toHaveLength(2);
    });

    it('refuse des dates hors année, inversées ou mal formées', async () => {
      const { year } = await structure();
      await post('/terms', { academicYearId: year.id, libelle: 'X', dateDebut: '2026-08-01', dateFin: '2026-12-15' }).expect(422);
      await post('/terms', { academicYearId: year.id, libelle: 'X', dateDebut: '2026-12-15', dateFin: '2026-09-01' }).expect(400);
      await post('/terms', { academicYearId: year.id, libelle: 'X', dateDebut: '01/09/2026', dateFin: '2026-12-15' }).expect(400);
    });

    it('refuse un numéro de trimestre déjà pris, modifie et supprime', async () => {
      const { year } = await structure();
      const t = (await post('/terms', { academicYearId: year.id, libelle: 'T1', dateDebut: '2026-09-01', dateFin: '2026-12-15', ordre: 1 })).body;
      await post('/terms', { academicYearId: year.id, libelle: 'T1 bis', dateDebut: '2027-01-05', dateFin: '2027-03-31', ordre: 1 }).expect(409);
      await patch(`/terms/${t.id}`, { dateFin: '2026-12-20' }).expect(200);
      await del(`/terms/${t.id}`).expect(200);
    });

    it('enregistre vacances et jours fériés (un seul jour par défaut)', async () => {
      const { year } = await structure();
      const ferie = (
        await post('/calendar-events', { academicYearId: year.id, type: 'FERIE', libelle: 'Fête nationale', dateDebut: '2026-11-28' }).expect(201)
      ).body;
      expect(ferie.dateDebut).toBe(ferie.dateFin);
      await post('/calendar-events', {
        academicYearId: year.id,
        type: 'VACANCES',
        libelle: 'Vacances de Noël',
        dateDebut: '2026-12-20',
        dateFin: '2027-01-04',
      }).expect(201);
      await post('/calendar-events', { academicYearId: year.id, type: 'AUTRE', libelle: 'X', dateDebut: '2028-01-01' }).expect(422);
      expect((await get(`/calendar-events?academicYearId=${year.id}`)).body).toHaveLength(2);
    });

    it('interdit toute modification du calendrier d’une année clôturée', async () => {
      const { year } = await structure();
      await post(`/academic-years/${year.id}/activate`, {}).expect(201);
      await post(`/academic-years/${year.id}/close`, {}).expect(201);
      await post('/terms', { academicYearId: year.id, libelle: 'T1', dateDebut: '2026-09-01', dateFin: '2026-12-15' }).expect(409);
    });
  });

  describe('classe pilote et enseignant volontaire', () => {
    it('désigne une seule classe pilote à la fois et peut la retirer', async () => {
      const { level, year, klass } = await structure();
      const other = (await post('/classes', { levelId: level.id, academicYearId: year.id, nom: 'CM2 B' })).body;

      await put('/pedagogy/pilot', { classId: klass.id }).expect(200);
      await put('/pedagogy/pilot', { classId: other.id }).expect(200);
      const pilots = await prisma.class.findMany({ where: { pilote: true } });
      expect(pilots.map((c) => c.id)).toEqual([other.id]);

      const cleared = await put('/pedagogy/pilot', { classId: null }).expect(200);
      expect(cleared.body.classe).toBeNull();
    });

    it('désigne un seul enseignant volontaire, actif uniquement, sans toucher la classe si la clé est absente', async () => {
      const { klass } = await structure();
      const a = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
      const b = (await post('/teachers', { nom: 'Ondze', prenom: 'Marie' })).body;
      await put('/pedagogy/pilot', { classId: klass.id }).expect(200);
      await put('/pedagogy/pilot', { teacherId: a.id }).expect(200);
      const res = await put('/pedagogy/pilot', { teacherId: b.id }).expect(200);
      expect(res.body.enseignant.id).toBe(b.id);
      expect(res.body.classe.id).toBe(klass.id);

      await patch(`/teachers/${a.id}`, { statut: 'INACTIF' });
      await put('/pedagogy/pilot', { teacherId: a.id }).expect(409);
      await put('/pedagogy/pilot', { classId: 'inconnue' }).expect(404);
    });
  });

  describe('récapitulatif de saisie', () => {
    it('reflète ce qui est saisi et ce qui manque, pour l’année active', async () => {
      const { level, year, klass } = await structure();
      await post(`/academic-years/${year.id}/activate`, {}).expect(201);

      const empty = (await get('/pedagogy/summary').expect(200)).body;
      expect(empty.anneeScolaire.libelle).toBe('2026-2027');
      expect(empty.creneaux).toEqual({ communs: 0, parSection: 0 });
      expect(empty.matieres.total).toBe(0);
      expect(empty.affectations.classes).toBe(1);
      expect(empty.affectations.requises).toBe(0);

      const math = (await post('/subjects', { code: 'MATH', nom: 'Maths' })).body;
      await post('/subjects', { code: 'ORPH', nom: 'Sans niveau' });
      await put(`/subjects/${math.id}/levels`, { levels: [{ levelId: level.id }] });
      const teacher = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
      await post('/teachers', { nom: 'Ondze', prenom: 'Marie' });
      await post('/rooms', { nom: 'Salle 1' });
      await post('/time-slots', { libelle: 'H1', heureDebut: '08:00', heureFin: '08:50' });
      await post('/terms', { academicYearId: year.id, libelle: 'T1', dateDebut: '2026-09-01', dateFin: '2026-12-15' });
      await post('/calendar-events', { academicYearId: year.id, type: 'FERIE', libelle: 'F', dateDebut: '2026-11-28' });

      let s = (await get('/pedagogy/summary')).body;
      expect(s.matieres).toEqual({ total: 2, sansNiveau: 1 });
      expect(s.affectations).toEqual({ classes: 1, classesCompletes: 0, requises: 1, manquantes: 1 });
      expect(s.enseignants).toEqual({ total: 2, actifs: 2, sansAffectation: 2 });
      expect(s.creneaux.communs).toBe(1);
      expect(s.trimestres).toBe(1);
      expect(s.calendrier.feries).toBe(1);
      expect(s.salles).toBe(1);

      await post('/assignments', { classId: klass.id, subjectId: math.id, teacherId: teacher.id }).expect(201);
      s = (await get('/pedagogy/summary')).body;
      expect(s.affectations).toEqual({ classes: 1, classesCompletes: 1, requises: 1, manquantes: 0 });
      expect(s.enseignants.sansAffectation).toBe(1);
    });

    it('fonctionne sans année active', async () => {
      const s = (await get('/pedagogy/summary').expect(200)).body;
      expect(s.anneeScolaire).toBeNull();
      expect(s.trimestres).toBe(0);
    });
  });

  describe('audit (RG15)', () => {
    it('journalise chaque action sensible du référentiel', async () => {
      const room = (await post('/rooms', { nom: 'Salle 1' })).body;
      await patch(`/rooms/${room.id}`, { capacite: 30 });
      await del(`/rooms/${room.id}`);
      const t = (await post('/teachers', { nom: 'Ngoma', prenom: 'Paul' })).body;
      await patch(`/teachers/${t.id}`, { statut: 'INACTIF' });

      const actions = (await prisma.auditLog.findMany()).map((l) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining(['ROOM_CREATE', 'ROOM_UPDATE', 'ROOM_DELETE', 'TEACHER_CREATE', 'TEACHER_UPDATE']),
      );
    });
  });
});

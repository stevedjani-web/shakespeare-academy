import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

/**
 * Grilles horaires nommées (rythme propre à certains niveaux) et classes combinées (un enseignant et une salle
 * partagés pour la même matière au même moment). Lundi 2026-09-07, année du 2026-09-01 au 2027-07-15.
 */
describe('Grilles horaires et classes combinées (e2e)', () => {
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
  const del = (path: string, t?: string) =>
    request(app.getHttpServer())
      .delete(path)
      .set('Authorization', `Bearer ${t ?? token}`);

  /**
   * Une école : deux classes d'un même niveau (A et B), une classe d'un autre niveau (C), deux matières, trois
   * enseignants, deux salles, une grille commune (H1, H2, pause).
   */
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
    const level2 = (
      await post('/levels', { cycleId: cycle.id, code: 'CM1', nom: 'CM1' })
    ).body;
    const year = (
      await post('/academic-years', {
        libelle: '2026-2027',
        dateDebut: '2026-09-01',
        dateFin: '2027-07-15',
      })
    ).body;
    const mkClass = async (levelId: string, nom: string) =>
      (
        await post('/classes', {
          levelId,
          academicYearId: year.id,
          nom,
        })
      ).body;
    const classA = await mkClass(level.id, 'CM2 A');
    const classB = await mkClass(level.id, 'CM2 B');
    const classC = await mkClass(level2.id, 'CM1 A');

    const slot = async (
      libelle: string,
      heureDebut: string,
      heureFin: string,
      extra: object = {},
    ) =>
      (await post('/time-slots', { libelle, heureDebut, heureFin, ...extra }))
        .body;
    const h1 = await slot('H1', '08:00', '08:50');
    const h2 = await slot('H2', '08:50', '09:40');
    const pause = await slot('Récréation', '09:40', '10:00', { type: 'PAUSE' });

    const math = (
      await post('/subjects', { code: 'MATH', nom: 'Mathématiques' })
    ).body;
    const fr = (await post('/subjects', { code: 'FR', nom: 'Français' })).body;
    for (const sub of [math, fr]) {
      await put(`/subjects/${sub.id}/levels`, {
        levels: [{ levelId: level.id }, { levelId: level2.id }],
      }).expect(200);
    }
    const mkTeacher = async (nom: string, prenom: string) =>
      (await post('/teachers', { nom, prenom })).body;
    const t1 = await mkTeacher('Ngoma', 'Paul');
    const t2 = await mkTeacher('Mabiala', 'Claire');
    const asg = (classId: string, subjectId: string, teacherId: string) =>
      post('/assignments', { classId, subjectId, teacherId }).expect(201);
    await asg(classA.id, math.id, t1.id);
    await asg(classB.id, math.id, t1.id);
    await asg(classA.id, fr.id, t2.id);
    await asg(classB.id, fr.id, t1.id); // Ngoma enseigne aussi le français à CM2 B
    await asg(classC.id, math.id, t2.id);

    const r1 = (await post('/rooms', { nom: 'Salle 1' })).body;
    const r2 = (await post('/rooms', { nom: 'Salle 2' })).body;
    return {
      year,
      level,
      level2,
      classA,
      classB,
      classC,
      h1,
      h2,
      pause,
      math,
      fr,
      t1,
      t2,
      r1,
      r2,
    };
  }

  const draft = async (yearId: string) =>
    (await post('/timetables', { academicYearId: yearId }).expect(201)).body;

  const entry = (
    tt: string,
    d: {
      classId: string;
      subjectId: string;
      timeSlotId: string;
      jourSemaine: number;
      roomId: string;
    },
  ) => post(`/timetables/${tt}/entries`, d);

  const grid = async (body: object) =>
    (await post('/time-grids', body).expect(201)).body;

  describe('grilles nommées', () => {
    it('crée une grille en copiant la grille commune, lui rattache des niveaux, la renomme et la liste', async () => {
      const s = await school();
      const g = await grid({
        nom: 'Primaire',
        copierDe: 'COMMUNE',
        levelIds: [s.level.id],
      });
      expect(g.creneaux).toBe(3);
      expect(g.niveaux.map((l: { id: string }) => l.id)).toEqual([s.level.id]);

      // Les créneaux copiés sont de nouveaux créneaux, ceux de la grille commune restent en place.
      const copied = (await get(`/time-slots?gridId=${g.id}`).expect(200)).body;
      expect(copied.map((c: { libelle: string }) => c.libelle)).toEqual([
        'H1',
        'H2',
        'Récréation',
      ]);
      expect(copied.map((c: { id: string }) => c.id)).not.toContain(s.h1.id);
      // Le récapitulatif compte les créneaux d'une grille nommée à part, jamais comme des créneaux communs.
      const summary = (await get('/pedagogy/summary').expect(200)).body;
      expect(summary.creneaux).toEqual({
        communs: 3,
        parSection: 0,
        parGrille: 3,
      });
      const common = (await get('/time-slots?sectionId=').expect(200)).body;
      expect(common).toHaveLength(3);

      const renamed = (
        await patch(`/time-grids/${g.id}`, { nom: 'Rythme primaire' }).expect(
          200,
        )
      ).body;
      expect(renamed.nom).toBe('Rythme primaire');
      const list = (await get('/time-grids').expect(200)).body;
      expect(list).toHaveLength(1);

      const journal = await prisma.auditLog.findMany({
        where: { action: { startsWith: 'TIME_GRID_' } },
      });
      expect(journal.map((j) => j.action).sort()).toEqual([
        'TIME_GRID_CREATE',
        'TIME_GRID_UPDATE',
      ]);
    });

    it('refuse un nom en double (accents et casse ignorés), une copie inconnue et un niveau inconnu', async () => {
      await school();
      await grid({ nom: 'Maternelle' });
      await post('/time-grids', { nom: ' maternelle ' }).expect(409);
      await post('/time-grids', { nom: 'Autre', copierDe: 'inconnue' }).expect(
        404,
      );
      await post('/time-grids', { nom: 'Autre', levelIds: ['inconnu'] }).expect(
        404,
      );
    });

    it('l’écriture exige PEDAGOGY_MANAGE ; la lecture reste ouverte', async () => {
      await school();
      const sch = await prisma.school.findFirstOrThrow();
      const { user, motDePasse } = await createUserWithRole(
        prisma,
        sch.id,
        'SECRETAIRE_CAISSIER',
      );
      const t = await login(user.email, motDePasse);
      await get('/time-grids', t).expect(200);
      await post('/time-grids', { nom: 'X' }, t).expect(403);
      await request(app.getHttpServer()).get('/time-grids').expect(401);
      const g = await grid({ nom: 'Y' });
      await put(`/time-grids/${g.id}/levels`, { levelIds: [] }, t).expect(403);
      await del(`/time-grids/${g.id}`, t).expect(403);
    });

    it('les créneaux d’une grille ne se chevauchent pas entre eux, mais peuvent recouvrir ceux d’une autre grille', async () => {
      const s = await school();
      const g = await grid({ nom: 'Primaire' });
      await post('/time-slots', {
        gridId: g.id,
        libelle: 'A',
        heureDebut: '07:30',
        heureFin: '08:30',
      }).expect(201);
      // Recouvre la grille commune (H1 08:00-08:50) mais pas l'autre créneau de la même grille.
      await post('/time-slots', {
        gridId: g.id,
        libelle: 'B',
        heureDebut: '08:30',
        heureFin: '09:30',
      }).expect(201);
      await post('/time-slots', {
        gridId: g.id,
        libelle: 'C',
        heureDebut: '09:00',
        heureFin: '10:00',
      }).expect(409);
      expect(s.h1.gridId ?? null).toBeNull();
    });

    it('un créneau est soit d’une section, soit d’une grille ; grille inconnue : 404', async () => {
      const s = await school();
      const g = await grid({ nom: 'Primaire' });
      const section = await prisma.section.findFirstOrThrow();
      await post('/time-slots', {
        gridId: g.id,
        sectionId: section.id,
        libelle: 'X',
        heureDebut: '11:00',
        heureFin: '11:50',
      }).expect(400);
      await post('/time-slots', {
        gridId: 'inconnue',
        libelle: 'X',
        heureDebut: '11:00',
        heureFin: '11:50',
      }).expect(404);
      expect(s.h1.id).toBeTruthy();
    });

    it('renvoie les créneaux de la grille qui s’applique à une classe', async () => {
      const s = await school();
      // Sans grille nommée : la grille commune.
      let slots = (
        await get(`/time-slots/for-class/${s.classA.id}`).expect(200)
      ).body;
      expect(slots.map((c: { id: string }) => c.id)).toContain(s.h1.id);

      const g = await grid({ nom: 'Primaire', levelIds: [s.level.id] });
      await post('/time-slots', {
        gridId: g.id,
        libelle: 'Matin',
        heureDebut: '07:30',
        heureFin: '10:00',
      }).expect(201);
      slots = (await get(`/time-slots/for-class/${s.classA.id}`).expect(200))
        .body;
      expect(slots.map((c: { libelle: string }) => c.libelle)).toEqual([
        'Matin',
      ]);
      // Un autre niveau reste sur la grille commune.
      const other = (
        await get(`/time-slots/for-class/${s.classC.id}`).expect(200)
      ).body;
      expect(other.map((c: { id: string }) => c.id)).toContain(s.h1.id);
      await get('/time-slots/for-class/inconnue').expect(404);
    });

    it('une séance ne peut utiliser qu’un créneau de la grille de sa classe', async () => {
      const s = await school();
      const g = await grid({
        nom: 'Primaire',
        copierDe: 'COMMUNE',
        levelIds: [s.level.id],
      });
      const own = (await get(`/time-slots?gridId=${g.id}`).expect(200)).body;
      const gridH1 = own.find((c: { libelle: string }) => c.libelle === 'H1');
      const tt = await draft(s.year.id);
      const base = {
        classId: s.classA.id,
        subjectId: s.math.id,
        jourSemaine: 1,
        roomId: s.r1.id,
      };
      // Créneau de la grille commune : refusé pour une classe qui a sa grille.
      const refused = await entry(tt.id, {
        ...base,
        timeSlotId: s.h1.id,
      }).expect(422);
      expect(refused.body.message).toContain('grille horaire');
      await entry(tt.id, { ...base, timeSlotId: gridH1.id }).expect(201);
      // La classe d'un autre niveau garde la grille commune, et refuse celle de la grille nommée.
      await entry(tt.id, {
        classId: s.classC.id,
        subjectId: s.math.id,
        jourSemaine: 2,
        roomId: s.r1.id,
        timeSlotId: gridH1.id,
      }).expect(422);
      await entry(tt.id, {
        classId: s.classC.id,
        subjectId: s.math.id,
        jourSemaine: 2,
        roomId: s.r1.id,
        timeSlotId: s.h1.id,
      }).expect(201);
    });

    it('rattacher ou retirer un niveau est refusé tant qu’un brouillon a des séances pour ce niveau', async () => {
      const s = await school();
      const g = await grid({ nom: 'Primaire' });
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        subjectId: s.math.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
        roomId: s.r1.id,
      }).expect(201);
      await put(`/time-grids/${g.id}/levels`, {
        levelIds: [s.level.id],
      }).expect(409);
      // Un niveau sans séance peut changer de grille.
      await put(`/time-grids/${g.id}/levels`, {
        levelIds: [s.level2.id],
      }).expect(200);
      await put(`/time-grids/${g.id}/levels`, { levelIds: [] }).expect(200);
    });

    it('remplace la liste des niveaux : ceux qui sortent retombent sur la grille commune', async () => {
      const s = await school();
      const g = await grid({ nom: 'Primaire', levelIds: [s.level.id] });
      const res = (
        await put(`/time-grids/${g.id}/levels`, {
          levelIds: [s.level2.id],
        }).expect(200)
      ).body;
      expect(res.niveaux.map((l: { id: string }) => l.id)).toEqual([
        s.level2.id,
      ]);
      const lvl = await prisma.level.findUniqueOrThrow({
        where: { id: s.level.id },
      });
      expect(lvl.gridId).toBeNull();
    });

    it('supprime une grille (et ses créneaux) seulement sans niveau ni séance', async () => {
      const s = await school();
      const g = await grid({
        nom: 'Primaire',
        copierDe: 'COMMUNE',
        levelIds: [s.level.id],
      });
      await del(`/time-grids/${g.id}`).expect(409); // un niveau la suit
      await put(`/time-grids/${g.id}/levels`, { levelIds: [] }).expect(200);

      // Une séance publiée ou en brouillon qui utilise un de ses créneaux la protège.
      const own = (await get(`/time-slots?gridId=${g.id}`).expect(200)).body;
      const tt = await draft(s.year.id);
      await put(`/time-grids/${g.id}/levels`, {
        levelIds: [s.level.id],
      }).expect(200);
      await entry(tt.id, {
        classId: s.classA.id,
        subjectId: s.math.id,
        timeSlotId: own[0].id,
        jourSemaine: 1,
        roomId: s.r1.id,
      }).expect(201);
      await put(`/time-grids/${g.id}/levels`, { levelIds: [] }).expect(409);
      await del(`/timetables/${tt.id}`).expect(200);
      await put(`/time-grids/${g.id}/levels`, { levelIds: [] }).expect(200);

      await del(`/time-grids/${g.id}`).expect(200);
      expect(await prisma.timeSlot.count({ where: { gridId: g.id } })).toBe(0);
      await del(`/time-grids/${g.id}`).expect(404);
    });
  });

  describe('classes combinées', () => {
    const combo = async (
      s: Awaited<ReturnType<typeof school>>,
      nom = 'Groupe',
    ) =>
      (
        await post('/class-combinations', {
          nom,
          academicYearId: s.year.id,
          classIds: [s.classA.id, s.classB.id],
        }).expect(201)
      ).body;

    it('crée, liste, renomme, modifie et supprime un groupe', async () => {
      const s = await school();
      const c = await combo(s, 'CM2 ensemble');
      expect(c.classes.map((x: { nom: string }) => x.nom)).toEqual([
        'CM2 A',
        'CM2 B',
      ]);
      const a = await prisma.class.findUniqueOrThrow({
        where: { id: s.classA.id },
      });
      expect(a.combinationId).toBe(c.id);

      const list = (
        await get(`/class-combinations?academicYearId=${s.year.id}`).expect(200)
      ).body;
      expect(list).toHaveLength(1);

      await patch(`/class-combinations/${c.id}`, { nom: 'Renommé' }).expect(
        200,
      );
      // Une troisième classe entre, une autre sort.
      const upd = (
        await patch(`/class-combinations/${c.id}`, {
          classIds: [s.classB.id, s.classC.id],
        }).expect(200)
      ).body;
      expect(upd.classes.map((x: { nom: string }) => x.nom).sort()).toEqual([
        'CM1 A',
        'CM2 B',
      ]);
      expect(
        (await prisma.class.findUniqueOrThrow({ where: { id: s.classA.id } }))
          .combinationId,
      ).toBeNull();

      await del(`/class-combinations/${c.id}`).expect(200);
      expect(
        (await prisma.class.findUniqueOrThrow({ where: { id: s.classB.id } }))
          .combinationId,
      ).toBeNull();
      await del(`/class-combinations/${c.id}`).expect(404);

      const journal = await prisma.auditLog.findMany({
        where: { action: { startsWith: 'CLASS_COMBINATION_' } },
      });
      expect(journal.map((j) => j.action).sort()).toEqual([
        'CLASS_COMBINATION_CREATE',
        'CLASS_COMBINATION_DELETE',
        'CLASS_COMBINATION_UPDATE',
        'CLASS_COMBINATION_UPDATE',
      ]);
    });

    it('refuse : une classe déjà groupée, un seul membre, un doublon de nom, une classe d’une autre année, une année clôturée', async () => {
      const s = await school();
      await combo(s, 'Groupe');
      await post('/class-combinations', {
        nom: 'Autre',
        academicYearId: s.year.id,
        classIds: [s.classB.id, s.classC.id],
      }).expect(409);
      await post('/class-combinations', {
        nom: ' groupe ',
        academicYearId: s.year.id,
        classIds: [s.classC.id, 'x'],
      }).expect(409);
      await post('/class-combinations', {
        nom: 'Seul',
        academicYearId: s.year.id,
        classIds: [s.classC.id],
      }).expect(400);
      await post('/class-combinations', {
        nom: 'Inconnue',
        academicYearId: s.year.id,
        classIds: [s.classC.id, 'x'],
      }).expect(404);

      const sch = await prisma.school.findFirstOrThrow();
      const otherYear = await prisma.academicYear.create({
        data: {
          schoolId: sch.id,
          libelle: '2027-2028',
          dateDebut: new Date('2027-09-01'),
          dateFin: new Date('2028-07-15'),
        },
      });
      const lvl = await prisma.level.findFirstOrThrow();
      const foreign = await prisma.class.create({
        data: {
          levelId: lvl.id,
          academicYearId: otherYear.id,
          nom: 'CM2 2027',
        },
      });
      await post('/class-combinations', {
        nom: 'Mixte',
        academicYearId: s.year.id,
        classIds: [s.classC.id, foreign.id],
      }).expect(400);

      await post(`/academic-years/${s.year.id}/activate`, {}).expect(201);
      await post(`/academic-years/${s.year.id}/close`, {}).expect(201);
      await post('/class-combinations', {
        nom: 'Tard',
        academicYearId: s.year.id,
        classIds: [s.classC.id, s.classA.id],
      }).expect(409);
    });

    it('l’écriture exige PEDAGOGY_MANAGE', async () => {
      const s = await school();
      const sch = await prisma.school.findFirstOrThrow();
      const { user, motDePasse } = await createUserWithRole(
        prisma,
        sch.id,
        'SECRETAIRE_CAISSIER',
      );
      const t = await login(user.email, motDePasse);
      await get('/class-combinations', t).expect(200);
      await post(
        '/class-combinations',
        {
          nom: 'X',
          academicYearId: s.year.id,
          classIds: [s.classA.id, s.classB.id],
        },
        t,
      ).expect(403);
    });
  });

  describe('conflits avec des classes combinées', () => {
    const slotCmp = (s: Awaited<ReturnType<typeof school>>) => ({
      subjectId: s.math.id,
      timeSlotId: s.h1.id,
      jourSemaine: 1,
    });

    it('sans groupe : le même enseignant ou la même salle pour deux classes au même moment est refusé', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        roomId: s.r1.id,
        ...slotCmp(s),
      }).expect(201);
      await entry(tt.id, {
        classId: s.classB.id,
        roomId: s.r1.id,
        ...slotCmp(s),
      }).expect(409);
    });

    it('avec un groupe : même matière, même enseignant, même salle, au même moment, c’est permis', async () => {
      const s = await school();
      await post('/class-combinations', {
        nom: 'CM2 ensemble',
        academicYearId: s.year.id,
        classIds: [s.classA.id, s.classB.id],
      }).expect(201);
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        roomId: s.r1.id,
        ...slotCmp(s),
      }).expect(201);
      await entry(tt.id, {
        classId: s.classB.id,
        roomId: s.r1.id,
        ...slotCmp(s),
      }).expect(201);

      // Les deux séances passent la vérification et la publication.
      const check = (await get(`/timetables/${tt.id}/check`).expect(200)).body;
      expect(check.pret).toBe(true);
      await post(`/timetables/${tt.id}/publish`, {
        dateEffet: '2026-09-07',
      }).expect(201);

      // Les deux classes voient leur cours dans la semaine réelle.
      const day = (await get('/timetable/day?date=2026-09-07').expect(200))
        .body;
      expect(day.seances).toHaveLength(2);
    });

    it('avec un groupe : une autre matière au même moment reste un conflit d’enseignant', async () => {
      const s = await school();
      await post('/class-combinations', {
        nom: 'CM2 ensemble',
        academicYearId: s.year.id,
        classIds: [s.classA.id, s.classB.id],
      }).expect(201);
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        roomId: s.r1.id,
        ...slotCmp(s),
      }).expect(201);
      // Ngoma enseigne le français à CM2 B : pas la même matière que les mathématiques de CM2 A.
      const res = await entry(tt.id, {
        classId: s.classB.id,
        roomId: s.r1.id,
        subjectId: s.fr.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
      }).expect(409);
      expect(res.body.message).toContain('enseignant');
    });

    it('avec un groupe : une classe d’un autre groupe ou hors groupe n’y gagne rien', async () => {
      const s = await school();
      await post('/class-combinations', {
        nom: 'CM2 ensemble',
        academicYearId: s.year.id,
        classIds: [s.classA.id, s.classB.id],
      }).expect(201);
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        roomId: s.r1.id,
        ...slotCmp(s),
      }).expect(201);
      // CM1 A n'est pas dans le groupe : même salle au même moment, refusé.
      await entry(tt.id, {
        classId: s.classC.id,
        roomId: s.r1.id,
        ...slotCmp(s),
      }).expect(409);
    });

    it('une classe ne peut jamais suivre deux cours en même temps, groupe ou non', async () => {
      const s = await school();
      await post('/class-combinations', {
        nom: 'CM2 ensemble',
        academicYearId: s.year.id,
        classIds: [s.classA.id, s.classB.id],
      }).expect(201);
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        roomId: s.r1.id,
        ...slotCmp(s),
      }).expect(201);
      await entry(tt.id, {
        classId: s.classA.id,
        roomId: s.r2.id,
        subjectId: s.fr.id,
        timeSlotId: s.h1.id,
        jourSemaine: 1,
      }).expect(409);
    });

    it('un groupe créé après coup rend la publication possible, le retirer la bloque de nouveau', async () => {
      const s = await school();
      const tt = await draft(s.year.id);
      await entry(tt.id, {
        classId: s.classA.id,
        roomId: s.r1.id,
        ...slotCmp(s),
      }).expect(201);
      // Sans groupe, la seconde séance est refusée à la saisie : on la crée directement en base pour simuler
      // un brouillon préparé avant la déclaration du groupe.
      const slot = s.h1;
      const second = await prisma.timetableEntry.create({
        data: {
          timetableId: tt.id,
          classId: s.classB.id,
          subjectId: s.math.id,
          teacherId: s.t1.id,
          roomId: s.r1.id,
          timeSlotId: slot.id,
          jourSemaine: 1,
          heureDebut: slot.heureDebut,
          heureFin: slot.heureFin,
        },
      });
      expect(second.id).toBeTruthy();
      expect((await get(`/timetables/${tt.id}/check`)).body.pret).toBe(false);

      const c = (
        await post('/class-combinations', {
          nom: 'CM2 ensemble',
          academicYearId: s.year.id,
          classIds: [s.classA.id, s.classB.id],
        }).expect(201)
      ).body;
      expect((await get(`/timetables/${tt.id}/check`)).body.pret).toBe(true);

      await del(`/class-combinations/${c.id}`).expect(200);
      expect((await get(`/timetables/${tt.id}/check`)).body.pret).toBe(false);
    });
  });
});

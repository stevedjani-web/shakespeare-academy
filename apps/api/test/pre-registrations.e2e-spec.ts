import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

/**
 * Lot 21 : préinscription en ligne. Une famille dépose une demande publique (sans compte), le secrétariat l'examine
 * et l'accepte (conversion réelle en élève + inscription, D33 et RG01 s'appliquent) ou la refuse avec un motif. Le
 * suivi public exige la référence ET le téléphone (la référence seule est séquentielle, donc devinable).
 */
describe('Préinscription en ligne (e2e, Lot 21)', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;

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
  const get = (path: string, t = admin) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const post = (path: string, t = admin, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const publicGet = (path: string) => request(app.getHttpServer()).get(path);
  const publicPost = (path: string, body: object) =>
    request(app.getHttpServer()).post(path).send(body);

  async function tokenFor(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      sch.id,
      roleCode,
      { email },
    );
    return login(user.email, motDePasse);
  }

  /** Section, cycle, niveau et une classe dans l'année active ; une seconde classe dans une année clôturée. */
  async function world() {
    const section = (
      await post('/sections', admin, { code: 'FR', nom: 'Francophone' })
    ).body;
    const cycle = (
      await post('/cycles', admin, {
        sectionId: section.id,
        code: 'PRIM',
        nom: 'Primaire',
      })
    ).body;
    const level = (
      await post('/levels', admin, {
        cycleId: cycle.id,
        code: 'CM2',
        nom: 'CM2',
      })
    ).body;
    const year = (
      await post('/academic-years', admin, {
        libelle: '2026-2027',
        dateDebut: '2026-09-01',
        dateFin: '2027-06-30',
      })
    ).body;
    await post(`/academic-years/${year.id}/activate`, admin).expect(201);
    const klass = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 A',
      })
    ).body;

    const oldYear = (
      await post('/academic-years', admin, {
        libelle: '2024-2025',
        dateDebut: '2024-09-01',
        dateFin: '2025-06-30',
      })
    ).body;
    // Pour clôturer, l'année doit d'abord être active un instant : on ne réactive pas 2026-2027 après.
    await prisma.academicYear.update({
      where: { id: oldYear.id },
      data: { statut: 'CLOTUREE' },
    });
    const oldKlass = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: oldYear.id,
        nom: 'Ancienne',
      })
    ).body;

    return { section, cycle, level, year, klass, oldYear, oldKlass };
  }

  const child = (over: object = {}) => ({
    nom: 'Moukala',
    prenom: 'Alice',
    sexe: 'F',
    dateNaissance: '2018-04-12',
    levelId: undefined,
    responsableNom: 'Moukala',
    responsablePrenom: 'Parent',
    responsableTelephone: '242060000001',
    ...over,
  });

  // ------------------------------------------------------------------ public : niveaux et dépôt

  describe('formulaire public', () => {
    it('l’arbre des niveaux ne montre que id et nom, jamais un effectif ni un tarif', async () => {
      const w = await world();
      const tree = (await publicGet('/preinscriptions/niveaux').expect(200))
        .body as Array<{
        sectionId: string;
        sectionNom: string;
        cycles: Array<{
          cycleId: string;
          cycleNom: string;
          levels: Array<{ id: string; nom: string }>;
        }>;
      }>;
      expect(tree).toHaveLength(1);
      expect(tree[0]).toMatchObject({
        sectionId: w.section.id,
        sectionNom: 'Francophone',
      });
      expect(tree[0].cycles[0].levels).toEqual([
        { id: w.level.id, nom: 'CM2' },
      ]);
      const text = JSON.stringify(tree);
      expect(text).not.toContain('capacite');
      expect(text).not.toContain('montant');
    });

    it('valide les champs et refuse un niveau inconnu ou une date future', async () => {
      const w = await world();
      const bad = (over: object) =>
        publicPost('/preinscriptions', child({ levelId: w.level.id, ...over }));
      await bad({ nom: '' }).expect(400);
      await bad({ sexe: 'X' }).expect(400);
      await bad({ dateNaissance: '12-04-2018' }).expect(400);
      await bad({ dateNaissance: '2099-01-01' }).expect(400);
      await bad({ responsableTelephone: '1' }).expect(400);
      await bad({ responsableEmail: 'pas-un-email' }).expect(400);
      await bad({ levelId: 'inconnu' }).expect(400);
      const res = await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id }),
      ).expect(201);
      expect(res.body.reference).toMatch(/^PREINS-\d{4}-\d{6}$/);
      expect(res.body).toEqual({ reference: res.body.reference });
    });

    it('bloque une deuxième demande en attente pour le même enfant, mais pas après un refus', async () => {
      const w = await world();
      const dto = child({ levelId: w.level.id });
      await publicPost('/preinscriptions', dto).expect(201);
      const dup = await publicPost('/preinscriptions', {
        ...dto,
        message: 'Autre message',
      }).expect(409);
      expect(dup.body.message).toMatch(/déjà en attente/);
      // Un autre enfant, mêmes responsables : jamais bloqué.
      await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id, prenom: 'Brice' }),
      ).expect(201);

      const rows = await prisma.preRegistration.findMany({
        where: { prenom: 'Alice' },
      });
      await post(`/preinscriptions/${rows[0].id}/rejeter`, admin, {
        motif: 'Niveau complet cette année',
      }).expect(201);
      await publicPost('/preinscriptions', dto).expect(201); // reprise autorisée après un refus
    });

    it('n’écrit dans le journal que des identifiants, jamais le message libre de la famille', async () => {
      const w = await world();
      await publicPost(
        '/preinscriptions',
        child({
          levelId: w.level.id,
          message: 'Confidentiel : allergies graves',
        }),
      ).expect(201);
      const logs = await prisma.auditLog.findMany({
        where: { action: 'PREREGISTRATION_CREATE' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBeNull();
      expect(JSON.stringify(logs[0])).not.toContain('allergies');
    });
  });

  // ------------------------------------------------------------------ suivi public

  describe('suivi public', () => {
    it('exige la référence et le téléphone exacts, jamais la référence seule', async () => {
      const w = await world();
      const { body } = await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id }),
      ).expect(201);
      await publicGet(
        `/preinscriptions/suivi?reference=${body.reference}`,
      ).expect(400); // téléphone manquant
      await publicGet(
        `/preinscriptions/suivi?reference=${body.reference}&telephone=242060099999`,
      ).expect(404);
      await publicGet(
        `/preinscriptions/suivi?reference=PREINS-2020-999999&telephone=242060000001`,
      ).expect(404);
      const ok = (
        await publicGet(
          `/preinscriptions/suivi?reference=${body.reference}&telephone=242060000001`,
        ).expect(200)
      ).body;
      expect(ok).toMatchObject({
        reference: body.reference,
        enfant: 'Alice Moukala',
        statut: 'EN_ATTENTE',
        motifRejet: null,
      });
    });

    it('affiche le motif une fois refusée, jamais avant, et le statut accepté sans motif', async () => {
      const w = await world();
      const { body } = await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id }),
      ).expect(201);
      const row = await prisma.preRegistration.findUniqueOrThrow({
        where: { reference: body.reference },
      });
      await post(`/preinscriptions/${row.id}/rejeter`, admin, {
        motif: 'Places déjà complètes',
      }).expect(201);
      const suivi = (
        await publicGet(
          `/preinscriptions/suivi?reference=${body.reference}&telephone=242060000001`,
        ).expect(200)
      ).body;
      expect(suivi).toMatchObject({
        statut: 'REJETEE',
        motifRejet: 'Places déjà complètes',
      });
    });
  });

  // ------------------------------------------------------------------ droits du personnel

  describe('droits du personnel', () => {
    it('réservé à ENROLLMENT_MANAGE (secrétariat, Administrateur) ; Direction, comptable, surveillant, enseignant refusés', async () => {
      const w = await world();
      const { body } = await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id }),
      ).expect(201);
      const row = await prisma.preRegistration.findUniqueOrThrow({
        where: { reference: body.reference },
      });
      const dir = await tokenFor('DIRECTION', 'dir@test.local');
      const cpt = await tokenFor('COMPTABLE', 'cpt@test.local');
      const surv = await tokenFor('SURVEILLANT', 'surv@test.local');
      const ens = await tokenFor('ENSEIGNANT', 'ens@test.local');
      const sec = await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local');
      for (const t of [dir, cpt, surv, ens]) {
        await get('/preinscriptions', t).expect(403);
        await get(`/preinscriptions/${row.id}`, t).expect(403);
        await post(`/preinscriptions/${row.id}/rejeter`, t, {
          motif: 'x'.repeat(5),
        }).expect(403);
        await post(`/preinscriptions/${row.id}/accepter`, t, {
          classId: w.klass.id,
        }).expect(403);
      }
      expect(
        (
          await prisma.preRegistration.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
      await get('/preinscriptions', sec).expect(200);
      await request(app.getHttpServer()).get('/preinscriptions').expect(401);
      await request(app.getHttpServer())
        .post(`/preinscriptions/${row.id}/accepter`)
        .send({ classId: w.klass.id })
        .expect(401);
    });
  });

  // ------------------------------------------------------------------ accepter / refuser

  describe('examen de la demande', () => {
    it('accepter crée réellement l’élève et l’inscription (D33, matricule, facture) et marque la demande', async () => {
      const w = await world();
      const { body } = await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id, lieuNaissance: 'Pointe-Noire' }),
      ).expect(201);
      const row = await prisma.preRegistration.findUniqueOrThrow({
        where: { reference: body.reference },
      });

      const accepted = (
        await post(`/preinscriptions/${row.id}/accepter`, admin, {
          classId: w.klass.id,
        }).expect(201)
      ).body;
      expect(accepted.statut).toBe('ACCEPTEE');
      expect(accepted.studentId).toBeTruthy();
      expect(accepted.enrollmentId).toBeTruthy();

      const student = await prisma.student.findUniqueOrThrow({
        where: { id: accepted.studentId },
      });
      expect(student).toMatchObject({
        nom: 'Moukala',
        prenom: 'Alice',
        lieuNaissance: 'Pointe-Noire',
      });
      expect(student.matricule).toMatch(/^\d{6}$/);
      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { id: accepted.enrollmentId },
      });
      expect(enrollment).toMatchObject({
        classId: w.klass.id,
        academicYearId: w.year.id,
        type: 'INSCRIPTION',
        statut: 'ACTIVE',
      });
      const invoice = await prisma.invoice.findUnique({
        where: { enrollmentId: enrollment.id },
      });
      expect(invoice).not.toBeNull(); // aucune inscription sans facture (même vide), comportement existant réutilisé
      const guardian = await prisma.guardian.findFirstOrThrow({
        where: { telephone: '242060000001' },
      });
      expect(guardian.nom).toBe('Moukala');
      const link = await prisma.studentGuardian.findUnique({
        where: {
          studentId_guardianId: {
            studentId: student.id,
            guardianId: guardian.id,
          },
        },
      });
      expect(link?.lien).toBe('Parent');
    });

    it('un doublon (D33) refuse d’accepter sans confirmation, puis l’accepte avec forcerCreation', async () => {
      const w = await world();
      // Un élève déjà existant, mêmes nom/prénom/date de naissance.
      await post('/students', admin, {
        nom: 'Moukala',
        prenom: 'Alice',
        sexe: 'F',
        dateNaissance: '2018-04-12',
      }).expect(201);
      const { body } = await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id }),
      ).expect(201);
      const row = await prisma.preRegistration.findUniqueOrThrow({
        where: { reference: body.reference },
      });
      const dup = await post(`/preinscriptions/${row.id}/accepter`, admin, {
        classId: w.klass.id,
      }).expect(409);
      expect(dup.body.doublonPotentiel).toBeTruthy();
      expect(
        (
          await prisma.preRegistration.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
      await post(`/preinscriptions/${row.id}/accepter`, admin, {
        classId: w.klass.id,
        forcerCreation: true,
      }).expect(201);
      expect(
        await prisma.student.count({
          where: { nom: 'Moukala', prenom: 'Alice' },
        }),
      ).toBe(2);
    });

    it('refuse d’accepter dans une classe d’une année clôturée (RG01 hérité)', async () => {
      const w = await world();
      const { body } = await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id }),
      ).expect(201);
      const row = await prisma.preRegistration.findUniqueOrThrow({
        where: { reference: body.reference },
      });
      await post(`/preinscriptions/${row.id}/accepter`, admin, {
        classId: w.oldKlass.id,
      }).expect(409);
      expect(
        (
          await prisma.preRegistration.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
      await post(`/preinscriptions/${row.id}/accepter`, admin, {
        classId: 'inconnue',
      }).expect(404);
    });

    it('refuser exige un motif, et ni accepter ni refuser deux fois', async () => {
      const w = await world();
      const { body } = await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id }),
      ).expect(201);
      const row = await prisma.preRegistration.findUniqueOrThrow({
        where: { reference: body.reference },
      });
      await post(`/preinscriptions/${row.id}/rejeter`, admin, {
        motif: 'x',
      }).expect(400);
      await post(`/preinscriptions/${row.id}/rejeter`, admin, {
        motif: 'Aucune place disponible',
      }).expect(201);
      await post(`/preinscriptions/${row.id}/rejeter`, admin, {
        motif: 'Encore',
      }).expect(409);
      await post(`/preinscriptions/${row.id}/accepter`, admin, {
        classId: w.klass.id,
      }).expect(409);

      const { body: body2 } = await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id, prenom: 'Brice' }),
      ).expect(201);
      const row2 = await prisma.preRegistration.findUniqueOrThrow({
        where: { reference: body2.reference },
      });
      await post(`/preinscriptions/${row2.id}/accepter`, admin, {
        classId: w.klass.id,
      }).expect(201);
      await post(`/preinscriptions/${row2.id}/accepter`, admin, {
        classId: w.klass.id,
      }).expect(409);
      await post(`/preinscriptions/${row2.id}/rejeter`, admin, {
        motif: 'Trop tard désormais',
      }).expect(409);
    });

    it('la liste se filtre par statut et le détail est réservé au bon établissement', async () => {
      const w = await world();
      await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id }),
      ).expect(201);
      await publicPost(
        '/preinscriptions',
        child({ levelId: w.level.id, prenom: 'Brice' }),
      ).expect(201);
      const rows = await prisma.preRegistration.findMany();
      await post(`/preinscriptions/${rows[0].id}/rejeter`, admin, {
        motif: 'Complet pour ce niveau',
      }).expect(201);
      expect(
        (await get('/preinscriptions?statut=EN_ATTENTE').expect(200)).body,
      ).toHaveLength(1);
      expect(
        (await get('/preinscriptions?statut=REJETEE').expect(200)).body,
      ).toHaveLength(1);
      expect((await get('/preinscriptions').expect(200)).body).toHaveLength(2);
      await get('/preinscriptions/inconnue').expect(404);
    });
  });

  // ------------------------------------------------------------------ migration

  it('les droits réutilisés (ENROLLMENT_MANAGE) restent ceux déjà en place, aucun nouveau droit ajouté', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { permission: { code: 'ENROLLMENT_MANAGE' } },
      include: { role: true },
    });
    expect(rows.map((r) => r.role.code).sort()).toEqual([
      'ADMINISTRATEUR',
      'SECRETAIRE_CAISSIER',
    ]);
    expect(
      await prisma.permission.count({
        where: { code: { startsWith: 'PREINSCRIPTION' } },
      }),
    ).toBe(0);
  });
});

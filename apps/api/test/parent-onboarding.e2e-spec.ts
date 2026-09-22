import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays } from '../src/timetable/timetable.util';
import { BULK_CODES_MAX_FAMILIES } from '../src/parent-portal/parent-accounts.service';
import { CONSENT_VERSION } from '../src/parent-portal/parent-auth.util';

/**
 * Lot 18 : mise en service des parents. Codes d'activation en lot par classe, jamais de régénération silencieuse
 * (elle annulerait des lettres déjà imprimées), un code par responsable, aucun code dans le journal.
 */
describe('Mise en service des parents (e2e, Lot 18)', () => {
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
  const DAY = 24 * 60 * 60 * 1000;

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

  const get = (path: string, t: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const post = (path: string, t: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const patch = (path: string, t: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const activate = (telephone: string, code: string) =>
    request(app.getHttpServer()).post('/portal/activate').send({
      telephone,
      code,
      motDePasse: 'MotDePasse123',
      consentement: true,
      versionPolitique: CONSENT_VERSION,
    });

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

  interface Letter {
    guardianId: string;
    nom: string;
    prenom: string;
    telephone: string;
    code: string;
    expireLe: string;
    enfants: Array<{ prenom: string; nom: string; classe: string | null }>;
  }
  interface Bulk {
    validiteJours: number;
    expireLe: string;
    generes: Letter[];
    ignores: {
      avecCompte: number;
      codeEnAttente: number;
      sansAcces: number;
      sansTelephone: number;
    };
  }

  const PHONE = {
    moukala: '242060000001',
    zola: '242060000002',
    nzila: '242060000003',
    bakala: '242060000004',
    kimbembe: '242060000005',
    lissouba: '242060000006',
    hugo: '242060000007',
  };

  /**
   * Année active avec deux classes. Familles : Moukala (Alice et Brice en A, Chloé en B : une seule famille),
   * Zola (Carine, A), Nzila (Diane, A), Bakala (Eva, B), Kimbembe (Farid, A, accès retiré), Lissouba (Gaby, jamais
   * inscrit), et Hugo, inscrit dans une année qui n'est PAS active.
   */
  async function school() {
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
        dateDebut: addDays(today, -120),
        dateFin: addDays(today, 200),
      })
    ).body;
    await post(`/academic-years/${year.id}/activate`, admin).expect(201);
    const classA = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 A',
      })
    ).body;
    const classB = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 B',
      })
    ).body;
    const feeType = (
      await post('/fee-types', admin, {
        code: 'INSCRIPTION',
        nom: "Frais d'inscription",
        obligatoire: true,
        avecTranches: false,
      })
    ).body;
    await post('/fee-schedules', admin, {
      academicYearId: year.id,
      levelId: level.id,
      feeTypeId: feeType.id,
      montant: 45000,
    }).expect(201);

    const mk = async (
      nom: string,
      prenom: string,
      tel: string,
      classId?: string,
    ) => {
      const student = (
        await post('/students', admin, {
          nom,
          prenom,
          sexe: 'F',
          dateNaissance: '2015-04-12',
          responsable: {
            nom,
            prenom: 'Parent',
            telephone: tel,
            lien: 'Parent',
          },
        }).expect(201)
      ).body;
      if (classId)
        await post('/enrollments', admin, {
          studentId: student.id,
          classId,
          academicYearId: year.id,
        }).expect(201);
      return student as { id: string };
    };
    const alice = await mk('Moukala', 'Alice', PHONE.moukala, classA.id);
    const brice = await mk('Moukala', 'Brice', PHONE.moukala, classA.id);
    const chloe = await mk('Moukala', 'Chloé', PHONE.moukala, classB.id);
    await mk('Zola', 'Carine', PHONE.zola, classA.id);
    await mk('Nzila', 'Diane', PHONE.nzila, classA.id);
    await mk('Bakala', 'Eva', PHONE.bakala, classB.id);
    const farid = await mk('Kimbembe', 'Farid', PHONE.kimbembe, classA.id);
    await mk('Lissouba', 'Gaby', PHONE.lissouba); // jamais inscrit

    // Hugo : inscrit, mais dans une année brouillon (pas l'année active).
    const year2 = (
      await post('/academic-years', admin, {
        libelle: '2027-2028',
        dateDebut: addDays(today, 201),
        dateFin: addDays(today, 500),
      })
    ).body;
    const classC = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: year2.id,
        nom: 'CM2 C',
      })
    ).body;
    const hugo = await mk('Hugo', 'Hugo', PHONE.hugo);
    await prisma.enrollment.create({
      data: {
        schoolId: (await prisma.school.findFirstOrThrow()).id,
        studentId: hugo.id,
        classId: classC.id,
        academicYearId: year2.id,
        numero: 'INS-FUTURE-1',
        type: 'INSCRIPTION',
        statut: 'ACTIVE',
      },
    });

    // Farid : son responsable n'a plus accès au portail pour lui (retiré par la Direction).
    const link = await prisma.studentGuardian.findFirstOrThrow({
      where: { studentId: farid.id },
    });
    await prisma.studentGuardian.update({
      where: { id: link.id },
      data: { accesPortail: false, accesMotif: 'Test' },
    });

    const guardians = await prisma.guardian.findMany();
    const g = (tel: string) => guardians.find((x) => x.telephone === tel)!;
    return { classA, classB, alice, brice, chloe, year, guardianOf: g };
  }

  const bulk = (body: object, t = admin) =>
    post('/parent-accounts/bulk-codes', t, body);
  const byPhone = (r: Bulk, tel: string) =>
    r.generes.find((l) => l.telephone === tel);

  // ------------------------------------------------------------------ résumé et filtres

  describe('suivi', () => {
    it('le résumé compte les familles concernées, au total et classe par classe', async () => {
      await school();
      const s = (await get('/parent-accounts/summary', admin).expect(200)).body;
      // Concernés : Moukala, Zola, Nzila, Bakala. Pas Kimbembe (accès retiré), ni Lissouba (jamais inscrit), ni Hugo (autre année).
      expect(s).toMatchObject({
        total: 4,
        actifs: 0,
        desactives: 0,
        codesEnAttente: 0,
        sansCode: 4,
        sansAcces: 1,
      });
      const a = s.classes.find((c: { classe: string }) => c.classe === 'CM2 A');
      const b = s.classes.find((c: { classe: string }) => c.classe === 'CM2 B');
      expect(a).toMatchObject({ total: 3, sansCode: 3 }); // Moukala, Zola, Nzila
      expect(b).toMatchObject({ total: 2, sansCode: 2 }); // Moukala (Chloé) et Bakala
    });

    it("le résumé suit l'avancement : code en attente, compte activé, compte désactivé", async () => {
      const x = await school();
      const r = (await bulk({ classId: x.classA.id }).expect(201)).body as Bulk;
      let s = (await get('/parent-accounts/summary', admin).expect(200)).body;
      expect(s).toMatchObject({ total: 4, codesEnAttente: 3, sansCode: 1 });

      await activate(PHONE.zola, byPhone(r, PHONE.zola)!.code).expect(201);
      await activate(PHONE.nzila, byPhone(r, PHONE.nzila)!.code).expect(201);
      s = (await get('/parent-accounts/summary', admin).expect(200)).body;
      expect(s).toMatchObject({
        total: 4,
        actifs: 2,
        codesEnAttente: 1,
        sansCode: 1,
      });

      await post(
        `/parent-accounts/guardians/${x.guardianOf(PHONE.nzila).id}/deactivate`,
        admin,
      ).expect(201);
      s = (await get('/parent-accounts/summary', admin).expect(200)).body;
      expect(s).toMatchObject({ actifs: 1, desactives: 1 });
    });

    it('la liste se filtre par classe et par état', async () => {
      const x = await school();
      await bulk({ classId: x.classA.id }).expect(201);
      const names = async (q: string) =>
        (
          (await get(`/parent-accounts?${q}`, admin).expect(200))
            .body as Array<{ nom: string }>
        )
          .map((g) => g.nom)
          .sort();
      expect(await names(`classId=${x.classB.id}`)).toEqual([
        'Bakala',
        'Moukala',
      ]);
      // Pas Kimbembe : son accès au portail est retiré, il n'a rien à activer.
      expect(await names(`classId=${x.classA.id}`)).toEqual([
        'Moukala',
        'Nzila',
        'Zola',
      ]);
      expect(await names('etat=CODE_EN_ATTENTE')).toEqual([
        'Moukala',
        'Nzila',
        'Zola',
      ]);
      expect(await names('etat=SANS_COMPTE')).toEqual([
        'Bakala',
        'Hugo',
        'Kimbembe',
        'Lissouba',
        'Moukala',
        'Nzila',
        'Zola',
      ]);
      expect(await names('etat=ACTIF')).toEqual([]);
      await get('/parent-accounts?etat=n_importe_quoi', admin).expect(400);
    });
  });

  // ------------------------------------------------------------------ génération en lot

  describe('génération en lot', () => {
    it('une lettre par famille, avec tous les enfants inscrits cette année, quelle que soit leur classe', async () => {
      const x = await school();
      const r = (await bulk({ classId: x.classA.id }).expect(201)).body as Bulk;
      // Classe A : les responsables de Alice/Brice (Moukala), Carine (Zola), Diane (Nzila). Pas Kimbembe (accès retiré).
      expect(r.generes.map((l) => l.nom).sort()).toEqual([
        'Moukala',
        'Nzila',
        'Zola',
      ]);
      const moukala = byPhone(r, PHONE.moukala)!;
      // Une seule lettre pour la famille, qui liste aussi Chloé (classe B).
      expect(
        moukala.enfants.map((e) => `${e.prenom}:${e.classe}`).sort(),
      ).toEqual(['Alice:CM2 A', 'Brice:CM2 A', 'Chloé:CM2 B']);
      for (const l of r.generes)
        expect(l.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(new Set(r.generes.map((l) => l.code)).size).toBe(r.generes.length);
      expect(r.ignores).toEqual({
        avecCompte: 0,
        codeEnAttente: 0,
        sansAcces: 1,
        sansTelephone: 0,
      });
    });

    it('exclut un responsable sans téléphone (facultatif, 22 septembre 2026) : un code généré serait inutilisable', async () => {
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
          dateDebut: addDays(today, -120),
          dateFin: addDays(today, 200),
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
      const student = (
        await post('/students', admin, {
          nom: 'SansTel',
          prenom: 'Enfant',
          sexe: 'F',
          dateNaissance: '2015-04-12',
          // Responsable facultatif sans téléphone (22 septembre 2026) : ne peut jamais activer de compte.
          responsable: { nom: 'SansTel', prenom: 'Parent', lien: 'Parent' },
        }).expect(201)
      ).body;
      await post('/enrollments', admin, {
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      }).expect(201);

      const r = (await bulk({}).expect(201)).body as Bulk;
      expect(r.generes).toHaveLength(0);
      expect(r.ignores).toEqual({
        avecCompte: 0,
        codeEnAttente: 0,
        sansAcces: 0,
        sansTelephone: 1,
      });
      expect(await prisma.parentActivationCode.count()).toBe(0);
    });

    it('le code remis active réellement le compte, et seule son empreinte est conservée', async () => {
      const x = await school();
      const r = (await bulk({ classId: x.classA.id }).expect(201)).body as Bulk;
      const zola = byPhone(r, PHONE.zola)!;
      const stored = JSON.stringify(
        await prisma.parentActivationCode.findMany(),
      );
      expect(stored).not.toContain(zola.code);
      expect(stored).not.toContain(zola.code.replace('-', ''));

      const res = await activate(PHONE.zola, zola.code).expect(201);
      expect(res.body.parent).toMatchObject({ nom: 'Zola' });
      await activate(PHONE.zola, zola.code).expect(401); // à usage unique
    });

    it('la validité est celle de l’école (30 jours par défaut), modifiable, ou choisie pour la génération', async () => {
      const x = await school();
      expect(
        (await prisma.school.findFirstOrThrow()).parentCodeValiditeJours,
      ).toBe(30);
      let r = (await bulk({ classId: x.classB.id }).expect(201)).body as Bulk;
      expect(r.validiteJours).toBe(30);
      expect(
        Math.round((new Date(r.expireLe).getTime() - Date.now()) / DAY),
      ).toBe(30);

      // Réglage de l'école modifiable (Administrateur), borné.
      await patch('/school', admin, { parentCodeValiditeJours: 10 }).expect(
        200,
      );
      await patch('/school', admin, { parentCodeValiditeJours: 0 }).expect(400);
      await patch('/school', admin, { parentCodeValiditeJours: 91 }).expect(
        400,
      );
      await bulk({ classId: x.classB.id, regenerer: true })
        .expect(201)
        .then((res) => {
          r = res.body as Bulk;
        });
      expect(r.validiteJours).toBe(10);

      // Durée choisie pour cette génération seulement.
      r = (
        await bulk({
          classId: x.classB.id,
          regenerer: true,
          validiteJours: 3,
        }).expect(201)
      ).body as Bulk;
      expect(r.validiteJours).toBe(3);
      expect(
        Math.round((new Date(r.expireLe).getTime() - Date.now()) / DAY),
      ).toBe(3);
      await bulk({ classId: x.classB.id, validiteJours: 91 }).expect(400);
      await bulk({ classId: x.classB.id, validiteJours: 0 }).expect(400);
    });

    it('ne touche ni un compte existant, ni un code encore valable, et rend compte de ce qu’il a ignoré', async () => {
      const x = await school();
      // Nzila a déjà activé son compte, Bakala a déjà un code en attente (généré à l'unité).
      const nzilaCode = (
        await post(
          `/parent-accounts/guardians/${x.guardianOf(PHONE.nzila).id}/activation-code`,
          admin,
        ).expect(201)
      ).body.code;
      await activate(PHONE.nzila, nzilaCode).expect(201);
      const bakalaCode = (
        await post(
          `/parent-accounts/guardians/${x.guardianOf(PHONE.bakala).id}/activation-code`,
          admin,
        ).expect(201)
      ).body.code;

      const r = (await bulk({}).expect(201)).body as Bulk; // toute l'école
      expect(r.generes.map((l) => l.nom).sort()).toEqual(['Moukala', 'Zola']);
      expect(r.ignores).toEqual({
        avecCompte: 1,
        codeEnAttente: 1,
        sansAcces: 1,
        sansTelephone: 0,
      });
      // Le code déjà remis à Bakala n'a pas été annulé.
      await activate(PHONE.bakala, bakalaCode).expect(201);
      // Jamais Lissouba (jamais inscrite) ni Hugo (autre année) ni Kimbembe (accès retiré).
      for (const tel of [PHONE.lissouba, PHONE.hugo, PHONE.kimbembe])
        expect(byPhone(r, tel)).toBeUndefined();
    });

    it('un second clic ne génère rien : les lettres déjà imprimées restent valables', async () => {
      const x = await school();
      const first = (await bulk({ classId: x.classA.id }).expect(201))
        .body as Bulk;
      const second = (await bulk({ classId: x.classA.id }).expect(201))
        .body as Bulk;
      expect(second.generes).toEqual([]);
      expect(second.ignores.codeEnAttente).toBe(3);
      // Les codes de la première génération marchent toujours.
      await activate(PHONE.zola, byPhone(first, PHONE.zola)!.code).expect(201);
    });

    it('« régénérer » annule l’ancien code et en donne un nouveau', async () => {
      const x = await school();
      const first = (await bulk({ classId: x.classA.id }).expect(201))
        .body as Bulk;
      const again = (
        await bulk({ classId: x.classA.id, regenerer: true }).expect(201)
      ).body as Bulk;
      expect(again.generes).toHaveLength(3);
      const oldCode = byPhone(first, PHONE.zola)!.code;
      const newCode = byPhone(again, PHONE.zola)!.code;
      expect(newCode).not.toBe(oldCode);
      await activate(PHONE.zola, oldCode).expect(401);
      await activate(PHONE.zola, newCode).expect(201);
    });

    it('refuse une classe inconnue, et une génération de plus de 500 familles', async () => {
      const x = await school();
      await bulk({ classId: 'inconnue' }).expect(404);

      // 501 familles sans compte, inscrites dans la classe B (créées directement pour aller vite).
      const sch = await prisma.school.findFirstOrThrow();
      const n = BULK_CODES_MAX_FAMILIES + 1;
      const idx = Array.from({ length: n }, (_, i) => i);
      await prisma.student.createMany({
        data: idx.map((i) => ({
          schoolId: sch.id,
          matricule: `MASS-${i}`,
          nom: `Mass${i}`,
          prenom: 'Eleve',
          sexe: 'F' as const,
          dateNaissance: new Date('2015-01-01'),
        })),
      });
      await prisma.guardian.createMany({
        data: idx.map((i) => ({
          schoolId: sch.id,
          nom: `Mass${i}`,
          prenom: 'Parent',
          telephone: `24290${String(i).padStart(7, '0')}`,
        })),
      });
      const students = await prisma.student.findMany({
        where: { matricule: { startsWith: 'MASS-' } },
      });
      const guardians = await prisma.guardian.findMany({
        where: { nom: { startsWith: 'Mass' } },
      });
      const gByName = new Map(guardians.map((g) => [g.nom, g.id]));
      await prisma.studentGuardian.createMany({
        data: students.map((s) => ({
          studentId: s.id,
          guardianId: gByName.get(s.nom)!,
          lien: 'Parent',
        })),
      });
      await prisma.enrollment.createMany({
        data: students.map((s, i) => ({
          schoolId: sch.id,
          studentId: s.id,
          classId: x.classB.id,
          academicYearId: x.year.id,
          numero: `MASS-INS-${i}`,
          type: 'INSCRIPTION' as const,
        })),
      });
      const res = await bulk({}).expect(422);
      expect(res.body.message).toContain('Trop de familles');
      expect(await prisma.parentActivationCode.count()).toBe(0); // rien n'a été généré
    });
  });

  // ------------------------------------------------------------------ journal et droits

  describe('journal et droits', () => {
    it('le journal garde la classe, le nombre et les identifiants, jamais un code', async () => {
      const x = await school();
      const r = (await bulk({ classId: x.classA.id }).expect(201)).body as Bulk;
      const audit = await prisma.auditLog.findMany({
        where: { action: 'PARENT_CODES_BULK' },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].nouvelleValeur).toMatchObject({
        classId: x.classA.id,
        nombre: 3,
      });
      const raw = JSON.stringify(await prisma.auditLog.findMany());
      for (const l of r.generes) {
        expect(raw).not.toContain(l.code);
        expect(raw).not.toContain(l.code.replace('-', ''));
      }
    });

    it('le secrétariat, la Direction et l’Administrateur génèrent ; les autres profils et les non connectés non', async () => {
      const x = await school();
      const body = { classId: x.classB.id, regenerer: true };
      await bulk(
        body,
        await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local'),
      ).expect(201);
      await bulk(body, await tokenFor('DIRECTION', 'dir@test.local')).expect(
        201,
      );
      await bulk(body).expect(201);
      for (const [role, email] of [
        ['COMPTABLE', 'cpt@test.local'],
        ['ENSEIGNANT', 'ens@test.local'],
        ['SURVEILLANT', 'surv@test.local'],
        ['AUDITEUR', 'aud@test.local'],
      ] as const) {
        const t = await tokenFor(role, email);
        await bulk(body, t).expect(403);
        await get('/parent-accounts/summary', t).expect(403);
      }
      await request(app.getHttpServer())
        .post('/parent-accounts/bulk-codes')
        .send(body)
        .expect(401);
      await request(app.getHttpServer())
        .get('/parent-accounts/summary')
        .expect(401);
    });

    it('un jeton de parent ne donne aucun accès à ces routes', async () => {
      const x = await school();
      const r = (await bulk({ classId: x.classA.id }).expect(201)).body as Bulk;
      const parent = (
        await activate(PHONE.zola, byPhone(r, PHONE.zola)!.code).expect(201)
      ).body.accessToken as string;
      await bulk({ classId: x.classA.id }, parent).expect(401);
      await get('/parent-accounts/summary', parent).expect(401);
    });
  });

  // ------------------------------------------------------------------ migration

  describe('migration des écoles existantes', () => {
    async function runMigration() {
      const sql = readFileSync(
        join(
          __dirname,
          '../prisma/migrations/20260923140000_lot18_mise_en_service_parents/migration.sql',
        ),
        'utf8',
      );
      const statements = sql
        .split(/;\s*\n/)
        .map((s) =>
          s
            .split('\n')
            .filter((l) => !l.trim().startsWith('--'))
            .join('\n')
            .trim(),
        )
        .filter(Boolean);
      expect(statements.length).toBe(2);
      for (const s of statements) await prisma.$executeRawUnsafe(s);
    }

    it('passe à 30 jours une école restée à 7, et ne touche jamais une durée déjà choisie', async () => {
      await prisma.school.updateMany({ data: { parentCodeValiditeJours: 7 } });
      await runMigration();
      expect(
        (await prisma.school.findFirstOrThrow()).parentCodeValiditeJours,
      ).toBe(30);
      await prisma.school.updateMany({ data: { parentCodeValiditeJours: 12 } });
      await runMigration();
      expect(
        (await prisma.school.findFirstOrThrow()).parentCodeValiditeJours,
      ).toBe(12);
    });
  });
});

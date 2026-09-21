import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

/**
 * Points ouverts de l'audit des rôles (23 septembre 2026) : la fiche complète d'un responsable (e-mail, adresse,
 * profession) est réservée à `GUARDIAN_DETAIL_READ` (le surveillant garde le nom, le lien et le téléphone), et
 * `SETTINGS_READ` porte la visibilité des pages Établissement, Années et Structure.
 */
describe("Points ouverts de l'audit des rôles (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    adminToken = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
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

  async function customToken(
    roleCode: string,
    permissions: string[],
    email: string,
  ) {
    const role = await prisma.role.create({
      data: { code: roleCode, nom: roleCode, description: 'test' },
    });
    const perms = await prisma.permission.findMany({
      where: { code: { in: permissions } },
    });
    expect(perms).toHaveLength(permissions.length);
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    return tokenFor(roleCode, email);
  }

  async function permissionsOf(roleCode: string): Promise<string[]> {
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: roleCode },
      include: { rolePermissions: { include: { permission: true } } },
    });
    return role.rolePermissions.map((rp) => rp.permission.code).sort();
  }

  async function rolesWith(code: string): Promise<string[]> {
    const rows = await prisma.role.findMany({
      where: { rolePermissions: { some: { permission: { code } } } },
      select: { code: true },
    });
    return rows.map((r) => r.code).sort();
  }

  /** Un élève dont le responsable a une fiche complète. */
  async function studentWithGuardian() {
    const student = (
      await post('/students', adminToken, {
        nom: 'Moukala',
        prenom: 'Alice',
        sexe: 'F',
        dateNaissance: '2015-04-12',
        responsable: {
          nom: 'Moukala',
          prenom: 'Jean',
          telephone: '242060000001',
          lien: 'Père',
        },
      }).expect(201)
    ).body;
    await prisma.guardian.updateMany({
      data: {
        email: 'jean.moukala@example.com',
        adresse: '12 avenue de la Paix, Brazzaville',
        profession: 'Ingénieur',
      },
    });
    return student as { id: string };
  }

  interface Dossier {
    studentGuardians: Array<{
      lien: string;
      guardian: {
        nom: string;
        prenom: string;
        telephone: string;
        email: string | null;
        adresse: string | null;
        profession: string | null;
      };
    }>;
  }

  describe('fiche complète du responsable (GUARDIAN_DETAIL_READ)', () => {
    it('la fiche complète est portée par tous les rôles qui lisent les dossiers, sauf le surveillant', async () => {
      expect(await rolesWith('GUARDIAN_DETAIL_READ')).toEqual([
        'ADMINISTRATEUR',
        'AUDITEUR',
        'COMPTABLE',
        'DIRECTION',
        'SECRETAIRE_CAISSIER',
      ]);
      // Le surveillant lit toujours les dossiers, mais pas la fiche complète.
      expect(await permissionsOf('SURVEILLANT')).toContain('STUDENT_READ');
      expect(await permissionsOf('SURVEILLANT')).not.toContain(
        'GUARDIAN_DETAIL_READ',
      );
    });

    it('le surveillant voit le nom, le lien et le téléphone du responsable, ni son e-mail, ni son adresse, ni sa profession', async () => {
      const student = await studentWithGuardian();
      const surveillant = await tokenFor('SURVEILLANT', 'surv@test.local');

      const dossier = (
        await get(`/students/${student.id}`, surveillant).expect(200)
      ).body as Dossier;
      expect(dossier.studentGuardians).toHaveLength(1);
      expect(dossier.studentGuardians[0].lien).toBe('Père');
      expect(dossier.studentGuardians[0].guardian).toMatchObject({
        nom: 'Moukala',
        prenom: 'Jean',
        telephone: '242060000001',
        email: null,
        adresse: null,
        profession: null,
      });
      const raw = JSON.stringify(dossier);
      for (const secret of [
        'jean.moukala@example.com',
        'avenue de la Paix',
        'Ingénieur',
      ])
        expect(raw).not.toContain(secret);
    });

    it('la recherche est réduite de la même façon, y compris par téléphone', async () => {
      await studentWithGuardian();
      const surveillant = await tokenFor('SURVEILLANT', 'surv@test.local');
      for (const q of ['Moukala', '242060000001']) {
        const found = (
          await get(`/students/search?q=${q}`, surveillant).expect(200)
        ).body as Dossier[];
        expect(found).toHaveLength(1);
        expect(found[0].studentGuardians[0].guardian.email).toBeNull();
        expect(JSON.stringify(found)).not.toContain('jean.moukala@example.com');
      }
    });

    it('le secrétariat, le comptable, l’auditeur, la Direction et l’Administrateur gardent la fiche complète', async () => {
      const student = await studentWithGuardian();
      const tokens = [
        adminToken,
        await tokenFor('DIRECTION', 'dir@test.local'),
        await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local'),
        await tokenFor('COMPTABLE', 'cpt@test.local'),
        await tokenFor('AUDITEUR', 'aud@test.local'),
      ];
      for (const t of tokens) {
        const dossier = (await get(`/students/${student.id}`, t).expect(200))
          .body as Dossier;
        expect(dossier.studentGuardians[0].guardian).toMatchObject({
          email: 'jean.moukala@example.com',
          adresse: '12 avenue de la Paix, Brazzaville',
          profession: 'Ingénieur',
        });
        const found = (await get('/students/search?q=Moukala', t).expect(200))
          .body as Dossier[];
        expect(found[0].studentGuardians[0].guardian.email).toBe(
          'jean.moukala@example.com',
        );
      }
    });

    it('un rôle sur mesure qui lit les dossiers sans ce droit est réduit, avec le droit il voit tout', async () => {
      const student = await studentWithGuardian();
      const sans = await customToken(
        'LECTEUR',
        ['STUDENT_READ'],
        'lect@test.local',
      );
      const avec = await customToken(
        'LECTEUR_COMPLET',
        ['STUDENT_READ', 'GUARDIAN_DETAIL_READ'],
        'lect2@test.local',
      );
      expect(
        (
          (await get(`/students/${student.id}`, sans).expect(200))
            .body as Dossier
        ).studentGuardians[0].guardian.email,
      ).toBeNull();
      expect(
        (
          (await get(`/students/${student.id}`, avec).expect(200))
            .body as Dossier
        ).studentGuardians[0].guardian.email,
      ).toBe('jean.moukala@example.com');
    });

    it('l’identité de l’élève et sa classe restent lisibles pour le surveillant', async () => {
      const student = await studentWithGuardian();
      const surveillant = await tokenFor('SURVEILLANT', 'surv@test.local');
      const dossier = (
        await get(`/students/${student.id}`, surveillant).expect(200)
      ).body as {
        nom: string;
        prenom: string;
        matricule: string;
        dateNaissance: string;
      };
      expect(dossier).toMatchObject({ nom: 'Moukala', prenom: 'Alice' });
      expect(dossier.matricule).toBeTruthy();
      expect(dossier.dateNaissance).toBeTruthy();
    });
  });

  describe('pages de réglages (SETTINGS_READ)', () => {
    it('elle est portée par l’Administrateur, la Direction et l’Auditeur seulement', async () => {
      expect(await rolesWith('SETTINGS_READ')).toEqual([
        'ADMINISTRATEUR',
        'AUDITEUR',
        'DIRECTION',
      ]);
    });

    it('elle est exposée au compte connecté, que le menu lit', async () => {
      const dir = await tokenFor('DIRECTION', 'dir@test.local');
      const ens = await tokenFor('ENSEIGNANT', 'ens@test.local');
      const permsOf = async (t: string) =>
        (
          (await get('/auth/me', t).expect(200)).body as {
            permissions: string[];
          }
        ).permissions;
      expect(await permsOf(dir)).toContain('SETTINGS_READ');
      expect(await permsOf(ens)).not.toContain('SETTINGS_READ');
    });
  });

  describe('migration des rôles existants', () => {
    /** Rejoue les instructions de la migration, comme le fait un déploiement sur une base déjà alimentée. */
    async function runMigration() {
      const sql = readFileSync(
        join(
          __dirname,
          '../prisma/migrations/20260923100000_audit_roles_guardian_detail_settings_read/migration.sql',
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
      expect(statements.length).toBeGreaterThanOrEqual(4);
      for (const s of statements) await prisma.$executeRawUnsafe(s);
    }

    it('une base sans ces droits les reçoit selon la règle, sans rien retirer, et le rejeu ne change rien', async () => {
      // État d'avant la migration : les deux permissions n'existent pas, sur aucun rôle.
      await prisma.rolePermission.deleteMany({
        where: {
          permission: {
            code: { in: ['GUARDIAN_DETAIL_READ', 'SETTINGS_READ'] },
          },
        },
      });
      await prisma.permission.deleteMany({
        where: { code: { in: ['GUARDIAN_DETAIL_READ', 'SETTINGS_READ'] } },
      });
      // Deux rôles sur mesure : l'un lit les dossiers, l'autre gère les années.
      for (const [code, perms] of [
        ['LECTEUR', ['STUDENT_READ']],
        ['GESTIONNAIRE_ANNEES', ['ACADEMIC_YEAR_MANAGE']],
      ] as const) {
        const role = await prisma.role.create({
          data: { code, nom: code, description: 'test' },
        });
        const found = await prisma.permission.findMany({
          where: { code: { in: [...perms] } },
        });
        await prisma.rolePermission.createMany({
          data: found.map((p) => ({ roleId: role.id, permissionId: p.id })),
        });
      }
      const surveillantBefore = await permissionsOf('SURVEILLANT');

      await runMigration();

      expect(await rolesWith('GUARDIAN_DETAIL_READ')).toEqual([
        'ADMINISTRATEUR',
        'AUDITEUR',
        'COMPTABLE',
        'DIRECTION',
        'LECTEUR',
        'SECRETAIRE_CAISSIER',
      ]);
      expect(await rolesWith('SETTINGS_READ')).toEqual([
        'ADMINISTRATEUR',
        'AUDITEUR',
        'DIRECTION',
        'GESTIONNAIRE_ANNEES',
      ]);
      // Le surveillant et l'enseignant n'ont rien gagné, personne n'a rien perdu.
      expect(await permissionsOf('SURVEILLANT')).toEqual(surveillantBefore);
      const count = await prisma.rolePermission.count();

      await runMigration();
      expect(await prisma.rolePermission.count()).toBe(count);
    });
  });
});

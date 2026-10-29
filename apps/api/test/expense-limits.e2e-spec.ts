import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { createExpense } from './utils/expenses';
import { monthKey } from '../src/expenses/expense-limits.util';

jest.setTimeout(30000);

describe('Sorties : plafonds de validation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let schoolId: string;
  let secretaireToken: string;
  let directionToken: string;
  let directionId: string;
  let comptableToken: string;
  let adminToken: string;
  let promoteurToken: string;
  let promoteurId: string;

  const http = () => request(app.getHttpServer());
  const as = (token: string, req: request.Test) =>
    req.set('Authorization', `Bearer ${token}`);

  async function login(email: string, motDePasse: string) {
    const res = await http()
      .post('/auth/login')
      .send({ email, motDePasse })
      .expect(201);
    return res.body.accessToken as string;
  }

  async function tokenFor(roleCode: string, email?: string) {
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      schoolId,
      roleCode,
      { email },
    );
    return { token: await login(user.email!, motDePasse), id: user.id };
  }

  /** Rôle sur mesure avec les permissions données (le Promoteur de production, ou un approbateur qui saisit aussi). */
  async function customRole(code: string, codes: string[]) {
    const perms = await prisma.permission.findMany({
      where: { code: { in: codes } },
    });
    expect(perms).toHaveLength(codes.length);
    const role = await prisma.role.create({
      data: { code, nom: code, description: 't' },
    });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const school = await seedBaseFixtures(prisma);
    schoolId = school.id;
    await customRole('PRO', [
      'EXPENSE_CREATE',
      'EXPENSE_APPROVE',
      'EXPENSE_APPROVE_UNLIMITED',
      'EXPENSE_DISBURSE',
      'CASH_CLOSE',
      'SETTINGS_MANAGE',
    ]);
    adminToken = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
    secretaireToken = (await tokenFor('SECRETAIRE_CAISSIER')).token;
    const direction = await tokenFor('DIRECTION');
    directionToken = direction.token;
    directionId = direction.id;
    comptableToken = (await tokenFor('COMPTABLE')).token;
    const pro = await tokenFor('PRO');
    promoteurToken = pro.token;
    promoteurId = pro.id;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Une demande de la secrétaire (qui saisit désormais les sorties). */
  async function newRequest(montant: number, token = secretaireToken) {
    const res = await createExpense(app, token, {
      categorie: 'FOURNITURES',
      montant,
      description: `Achat de ${montant}`,
    }).expect(201);
    return res.body as { id: string };
  }
  const approve = (token: string, id: string) =>
    as(token, http().post(`/expenses/${id}/approve`));
  const limits = async (token: string) =>
    (await as(token, http().get('/expenses/approval-limits')).expect(200)).body;
  async function setLimits(
    seuil: number | null,
    plafond: number | null,
  ): Promise<void> {
    await prisma.school.update({
      where: { id: schoolId },
      data: {
        sortieSeuilOperationFcfa: seuil,
        sortiePlafondMensuelFcfa: plafond,
      },
    });
  }

  describe('valeurs par défaut et consultation', () => {
    it('100 000 par opération et 500 000 par mois, rien de consommé au départ', async () => {
      const school = await prisma.school.findFirstOrThrow();
      expect(school.sortieSeuilOperationFcfa).toBe(100000);
      expect(school.sortiePlafondMensuelFcfa).toBe(500000);
      const l = await limits(directionToken);
      expect(l).toMatchObject({
        seuilOperation: 100000,
        plafondMensuel: 500000,
        utiliseMois: 0,
        resteMois: 500000,
        illimite: false,
      });
      expect(l.mois).toMatch(/^\d{4}-\d{2}$/);
      expect((await limits(promoteurToken)).illimite).toBe(true);
    });

    it('la route est réservée aux profils de la clôture', async () => {
      await http().get('/expenses/approval-limits').expect(401);
      const { token } = await tokenFor('AUDITEUR');
      await as(token, http().get('/expenses/approval-limits')).expect(403);
    });
  });

  describe('plafond par opération', () => {
    it('exactement 100 000 passe, 100 001 est refusé et reste en attente', async () => {
      const ok = await newRequest(100000);
      await approve(directionToken, ok.id).expect(201);

      const over = await newRequest(100001);
      const res = await approve(directionToken, over.id).expect(403);
      expect(res.body.code).toBe('EXPENSE_LIMIT_OPERATION');
      expect(res.body.seuil).toBe(100000);
      expect(res.body.message).toContain('Promoteur');
      const after = await prisma.expense.findUniqueOrThrow({
        where: { id: over.id },
      });
      expect(after.statut).toBe('EN_ATTENTE');
      expect(after.approbateurId).toBeNull();
    });

    it('le message suit la langue demandée', async () => {
      const over = await newRequest(250000);
      const res = await as(
        directionToken,
        http()
          .post(`/expenses/${over.id}/approve`)
          .set('Accept-Language', 'en'),
      ).expect(403);
      expect(res.body.message).toContain('per operation');
    });

    it('le Promoteur approuve sans limite, et ne consomme pas le plafond du mois', async () => {
      const big = await newRequest(3000000);
      const res = await approve(promoteurToken, big.id).expect(201);
      expect(res.body.statut).toBe('APPROUVEE');
      expect(res.body.approuveIllimite).toBe(true);
      expect((await limits(directionToken)).utiliseMois).toBe(0);
    });

    it('rejeter n’est jamais limité', async () => {
      const big = await newRequest(900000);
      await as(
        directionToken,
        http().post(`/expenses/${big.id}/reject`).send({ motif: 'Trop cher' }),
      ).expect(201);
    });
  });

  describe('plafond mensuel global', () => {
    it('500 000 en tout : le total atteint est accepté, un franc de plus est refusé', async () => {
      for (let i = 0; i < 5; i++) {
        const e = await newRequest(100000);
        await approve(directionToken, e.id).expect(201);
      }
      const l = await limits(directionToken);
      expect(l.utiliseMois).toBe(500000);
      expect(l.resteMois).toBe(0);

      const one = await newRequest(1);
      const res = await approve(directionToken, one.id).expect(403);
      expect(res.body.code).toBe('EXPENSE_LIMIT_MONTHLY');
      expect(res.body.reste).toBe(0);
      expect(res.body.plafond).toBe(500000);
      // Le Promoteur peut toujours valider.
      await approve(promoteurToken, one.id).expect(201);
    });

    it('indique ce qu’il reste quand le montant ne tient plus', async () => {
      for (const m of [100000, 100000, 100000, 100000, 50000]) {
        await approve(directionToken, (await newRequest(m)).id).expect(201);
      }
      const e = await newRequest(60000);
      const res = await approve(directionToken, e.id).expect(403);
      expect(res.body.code).toBe('EXPENSE_LIMIT_MONTHLY');
      expect(res.body.reste).toBe(50000);
      expect(res.body.message).toContain('50');
      const small = await newRequest(50000);
      await approve(directionToken, small.id).expect(201);
    });

    it('le plafond est global : il se partage entre tous les approbateurs non illimités', async () => {
      const second = await tokenFor('DIRECTION', 'direction2@test.local');
      for (let i = 0; i < 3; i++)
        await approve(directionToken, (await newRequest(100000)).id).expect(
          201,
        );
      for (let i = 0; i < 2; i++)
        await approve(second.token, (await newRequest(100000)).id).expect(201);
      const e = await newRequest(1000);
      await approve(directionToken, e.id).expect(403);
      await approve(second.token, e.id).expect(403);
    });

    it('une sortie annulée libère son montant', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const e = await newRequest(100000);
        await approve(directionToken, e.id).expect(201);
        ids.push(e.id);
      }
      const blocked = await newRequest(100000);
      await approve(directionToken, blocked.id).expect(403);
      await as(
        directionToken,
        http().post(`/expenses/${ids[0]}/cancel`).send({ motif: 'Erreur' }),
      ).expect(201);
      expect((await limits(directionToken)).resteMois).toBe(100000);
      await approve(directionToken, blocked.id).expect(201);
    });

    it('une sortie décaissée reste comptée', async () => {
      const e = await newRequest(80000);
      await approve(directionToken, e.id).expect(201);
      await as(comptableToken, http().post(`/expenses/${e.id}/disburse`))
        .field('payload', JSON.stringify({ modePaiement: 'ESPECES' }))
        .expect(201);
      expect((await limits(directionToken)).utiliseMois).toBe(80000);
    });

    it('deux approbations simultanées ne dépassent pas le plafond', async () => {
      await setLimits(100000, 150000);
      const a = await newRequest(100000);
      const b = await newRequest(100000);
      const results = await Promise.all([
        approve(directionToken, a.id),
        approve(directionToken, b.id),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
      expect((await limits(directionToken)).utiliseMois).toBe(100000);
    });

    it('une approbation attend le verrou du plafond tant qu’une autre est en cours', async () => {
      const e = await newRequest(50000);
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const lockedP = new Promise<void>((resolve) => (locked = resolve));
      const tx = prisma.$transaction(
        async (t) => {
          await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'expense-approval:' + schoolId}))`;
          locked();
          await held;
        },
        { timeout: 20000 },
      );
      await lockedP;
      let done = false;
      const pending = approve(directionToken, e.id).then((r) => {
        done = true;
        return r;
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(done).toBe(false);
      release();
      await tx;
      expect((await pending).status).toBe(201);
    });

    it('le mois se compte à la date d’approbation, dans le fuseau de l’établissement', async () => {
      const school = await prisma.school.findFirstOrThrow();
      const tz = school.fuseauHoraire;
      const mois = monthKey(new Date(), tz);
      const [y, m] = mois.split('-').map(Number);
      // Brazzaville est à UTC+1 : le 1er du mois à 00 h 30 locales est la veille à 23 h 30 UTC.
      expect(tz).toBe('Africa/Brazzaville');
      const startLocal = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - 3600 * 1000);
      const inside = new Date(startLocal.getTime() + 30 * 60 * 1000);
      const outside = new Date(startLocal.getTime() - 30 * 60 * 1000);
      const base = {
        schoolId,
        categorie: 'FOURNITURES',
        description: 'x',
        effectueParId: promoteurId,
        approbateurId: directionId,
        statut: 'APPROUVEE' as const,
      };
      await prisma.expense.create({
        data: { ...base, montant: 70000, dateDecision: inside },
      });
      await prisma.expense.create({
        data: { ...base, montant: 90000, dateDecision: outside },
      });
      expect((await limits(directionToken)).utiliseMois).toBe(70000);
    });
  });

  describe('réglage des plafonds', () => {
    it('vides = pas de limite', async () => {
      await setLimits(null, null);
      const big = await newRequest(5000000);
      await approve(directionToken, big.id).expect(201);
      const l = await limits(directionToken);
      expect(l.seuilOperation).toBeNull();
      expect(l.resteMois).toBeNull();
    });

    it('seul le Promoteur règle les plafonds ; les autres reçoivent 403 même avec SETTINGS_MANAGE', async () => {
      await as(
        adminToken,
        http().patch('/school').send({ sortieSeuilOperationFcfa: 900000 }),
      ).expect(403);
      // Renvoyer la valeur actuelle n'est pas un changement.
      await as(
        adminToken,
        http().patch('/school').send({ sortieSeuilOperationFcfa: 100000 }),
      ).expect(200);
      await as(
        promoteurToken,
        http().patch('/school').send({ sortieSeuilOperationFcfa: 200000 }),
      ).expect(200);
      expect((await limits(directionToken)).seuilOperation).toBe(200000);
      const e = await newRequest(150000);
      await approve(directionToken, e.id).expect(201);
    });

    it('valeurs invalides refusées, vide accepté, changement journalisé sans autre donnée', async () => {
      for (const bad of [0, -5, 1.5, 'abc'])
        await as(
          promoteurToken,
          http().patch('/school').send({ sortiePlafondMensuelFcfa: bad }),
        ).expect(400);
      await as(
        promoteurToken,
        http().patch('/school').send({ sortiePlafondMensuelFcfa: 800000 }),
      ).expect(200);
      await as(
        promoteurToken,
        http().patch('/school').send({ sortiePlafondMensuelFcfa: null }),
      ).expect(200);
      const logs = await prisma.auditLog.findMany({
        where: { action: 'SCHOOL_EXPENSE_LIMITS_UPDATE' },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs).toHaveLength(2);
      expect(logs[0].ancienneValeur).toEqual({
        sortiePlafondMensuelFcfa: 500000,
      });
      expect(logs[0].nouvelleValeur).toEqual({
        sortiePlafondMensuelFcfa: 800000,
      });
      expect(logs[1].nouvelleValeur).toEqual({
        sortiePlafondMensuelFcfa: null,
      });
      expect(logs[1].userId).toBe(promoteurId);
    });

    it('le droit est réservé : l’Administrateur ne peut pas se l’accorder', async () => {
      const adminRole = await prisma.role.findUniqueOrThrow({
        where: { code: 'ADMINISTRATEUR' },
        include: { rolePermissions: { include: { permission: true } } },
      });
      const codes = adminRole.rolePermissions.map((rp) => rp.permission.code);
      await as(
        adminToken,
        http()
          .put(`/roles/${adminRole.id}/permissions`)
          .send({ permissionCodes: [...codes, 'EXPENSE_APPROVE_UNLIMITED'] }),
      ).expect(403);
    });
  });

  describe('auto-approbation du Promoteur', () => {
    it('le Promoteur approuve sa propre demande, c’est journalisé, un autre confirme la sortie', async () => {
      const mine = await newRequest(400000, promoteurToken);
      const res = await approve(promoteurToken, mine.id).expect(201);
      expect(res.body.statut).toBe('APPROUVEE');
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'EXPENSE_APPROVE', entiteId: mine.id },
      });
      expect(
        (log.nouvelleValeur as { controlePlafond: unknown }).controlePlafond,
      ).toEqual({ illimite: true, autoApprobation: true });
      // Celui qui a approuvé ne confirme pas la sortie réelle.
      await as(promoteurToken, http().post(`/expenses/${mine.id}/disburse`))
        .field('payload', JSON.stringify({ modePaiement: 'ESPECES' }))
        .expect(403);
      await as(comptableToken, http().post(`/expenses/${mine.id}/disburse`))
        .field('payload', JSON.stringify({ modePaiement: 'ESPECES' }))
        .expect(201);
    });

    it('un approbateur sans l’autorité illimitée n’approuve jamais sa propre demande', async () => {
      await customRole('APPRO_SAISIE', [
        'EXPENSE_CREATE',
        'EXPENSE_APPROVE',
        'CASH_CLOSE',
      ]);
      const { token } = await tokenFor('APPRO_SAISIE');
      const mine = await newRequest(10000, token);
      await approve(token, mine.id).expect(403);
    });
  });

  describe('migration', () => {
    it('donne le droit au seul rôle PRO, rejouée sans effet de bord, et marque l’historique du Promoteur', async () => {
      await prisma.rolePermission.deleteMany({
        where: { permission: { code: 'EXPENSE_APPROVE_UNLIMITED' } },
      });
      await prisma.permission.deleteMany({
        where: { code: 'EXPENSE_APPROVE_UNLIMITED' },
      });
      // Deux sorties déjà approuvées avant la migration : une par le Promoteur, une par la Direction.
      const base = {
        schoolId,
        categorie: 'FOURNITURES',
        description: 'x',
        effectueParId: promoteurId,
        statut: 'APPROUVEE' as const,
        dateDecision: new Date(),
        montant: 250000,
      };
      const byPro = await prisma.expense.create({
        data: { ...base, approbateurId: promoteurId },
      });
      const byDir = await prisma.expense.create({
        data: { ...base, approbateurId: directionId },
      });
      const sql = readFileSync(
        join(
          __dirname,
          '../prisma/migrations/20261029080000_plafonds_validation_sorties/migration.sql',
        ),
        'utf8',
      );
      const statements = sql
        .split(/;\s*\n/)
        .map((x) =>
          x
            .split('\n')
            .filter((l) => !l.trim().startsWith('--'))
            .join('\n')
            .trim(),
        )
        .filter((x) => x.startsWith('INSERT') || x.startsWith('UPDATE'));
      expect(statements).toHaveLength(3);
      for (let i = 0; i < 2; i++)
        for (const st of statements) await prisma.$executeRawUnsafe(st);
      const holders = (
        await prisma.rolePermission.findMany({
          where: { permission: { code: 'EXPENSE_APPROVE_UNLIMITED' } },
          include: { role: true },
        })
      ).map((rp) => rp.role.code);
      expect(holders).toEqual(['PRO']);
      expect(
        (await prisma.expense.findUniqueOrThrow({ where: { id: byPro.id } }))
          .approuveIllimite,
      ).toBe(true);
      expect(
        (await prisma.expense.findUniqueOrThrow({ where: { id: byDir.id } }))
          .approuveIllimite,
      ).toBe(false);
    });
  });
});

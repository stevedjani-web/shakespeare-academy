import { INestApplication } from '@nestjs/common';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentsService } from '../src/payments/payments.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { PDF_BYTES, createExpense } from './utils/expenses';

jest.setTimeout(30000);

const FILES_DIR = join(process.cwd(), 'private-uploads', 'deposits');

describe('Versements en banque des espèces encaissées (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payments: PaymentsService;
  let schoolId: string;
  let adminId: string;
  let adminToken: string;
  let directionToken: string;
  let comptableToken: string;
  let secretaireToken: string;
  let auditeurToken: string;
  let lines: { first: string; second: string };

  const http = () => request(app.getHttpServer());
  const as = (token: string, req: request.Test) =>
    req.set('Authorization', `Bearer ${token}`);
  const today = () => new Date().toISOString().slice(0, 10);

  async function login(email: string, motDePasse: string) {
    const res = await http()
      .post('/auth/login')
      .send({ email, motDePasse })
      .expect(201);
    return res.body.accessToken as string;
  }
  async function tokenFor(roleCode: string) {
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      schoolId,
      roleCode,
    );
    return login(user.email, motDePasse);
  }
  /** Un compte au rôle sur mesure, pour les cas où une même personne cumule des droits. */
  async function customToken(code: string, permissions: string[]) {
    const role = await prisma.role.create({
      data: { code, nom: code, description: 't' },
    });
    const perms = await prisma.permission.findMany({
      where: { code: { in: permissions } },
    });
    expect(perms).toHaveLength(permissions.length);
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      schoolId,
      code,
    );
    return {
      token: await login(user.email, motDePasse),
      userId: user.id,
    };
  }

  /** Déclare un versement avec son bordereau (PDF) ; `file: false` pour tester le refus sans pièce. */
  function declare(
    token: string,
    body: Record<string, unknown> = {},
    options: { file?: boolean } = {},
  ) {
    let req = as(token, http().post('/bank-deposits')).field(
      'payload',
      JSON.stringify({
        montant: 30000,
        dateVersement: today(),
        banque: 'Banque Centrale',
        numeroBordereau: 'BV-0001',
        ...body,
      }),
    );
    if (options.file !== false) {
      req = req.attach('bordereau', PDF_BYTES, {
        filename: 'bordereau.pdf',
        contentType: 'application/pdf',
      });
    }
    return req;
  }

  async function setupLines() {
    const section = await as(adminToken, http().post('/sections')).send({
      code: 'FR',
      nom: 'Francophone',
    });
    const cycle = await as(adminToken, http().post('/cycles')).send({
      sectionId: section.body.id,
      code: 'PRIMAIRE',
      nom: 'Primaire',
    });
    const level = await as(adminToken, http().post('/levels')).send({
      cycleId: cycle.body.id,
      code: 'CM2',
      nom: 'CM2',
    });
    const year = await as(adminToken, http().post('/academic-years')).send({
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-07-15',
    });
    await as(
      adminToken,
      http().post(`/academic-years/${year.body.id}/activate`),
    );
    const klass = await as(adminToken, http().post('/classes')).send({
      levelId: level.body.id,
      academicYearId: year.body.id,
      nom: 'CM2 A',
    });
    const feeType = await as(adminToken, http().post('/fee-types')).send({
      code: 'FRAIS_INSCRIPTION',
      nom: "Frais d'inscription",
      obligatoire: true,
      avecTranches: false,
    });
    await as(adminToken, http().post('/fee-schedules')).send({
      academicYearId: year.body.id,
      levelId: level.body.id,
      feeTypeId: feeType.body.id,
      montant: 200000,
    });
    const line = async (nom: string, telephone: string) => {
      const student = await as(adminToken, http().post('/students')).send({
        nom,
        prenom: 'Élève',
        sexe: 'F',
        dateNaissance: '2015-04-12',
        responsable: { nom, prenom: 'Parent', telephone, lien: 'Père' },
      });
      const enrollment = await as(adminToken, http().post('/enrollments')).send(
        {
          studentId: student.body.id,
          classId: klass.body.id,
          academicYearId: year.body.id,
        },
      );
      const invoice = await as(
        adminToken,
        http().get(`/invoices/by-enrollment/${enrollment.body.id}`),
      );
      return invoice.body.lines[0].id as string;
    };
    return {
      first: await line('Alpha', '242060000001'),
      second: await line('Bravo', '242060000002'),
    };
  }

  /** 100 000 en espèces, 50 000 en Mobile Money et 50 000 repris d'avant l'application : le tiroir doit contenir les espèces et la reprise, pas le Mobile Money. */
  async function collect() {
    await as(adminToken, http().post('/payments'))
      .send({ invoiceLineId: lines.first, montant: 100000 })
      .expect(201);
    await as(adminToken, http().post('/payments'))
      .send({
        invoiceLineId: lines.first,
        montant: 50000,
        modePaiement: 'MOBILE_MONEY',
        referenceExterne: 'MP123',
      })
      .expect(201);
    await payments.recordHistorical(
      {
        invoiceLineId: lines.second,
        montant: 50000,
        datePaiement: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
      adminId,
    );
  }

  const summary = async () =>
    (await as(adminToken, http().get('/bank-deposits/summary')).expect(200))
      .body;
  const closing = async (date = today()) =>
    (
      await as(
        adminToken,
        http().get(`/reports/cash-closing?date=${date}`),
      ).expect(200)
    ).body;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    payments = app.get(PaymentsService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const school = await seedBaseFixtures(prisma);
    schoolId = school.id;
    adminToken = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
    adminId = (
      await prisma.user.findFirstOrThrow({
        where: { email: 'admin@shakespeareacademy.cg' },
      })
    ).id;
    directionToken = await tokenFor('DIRECTION');
    comptableToken = await tokenFor('COMPTABLE');
    secretaireToken = await tokenFor('SECRETAIRE_CAISSIER');
    auditeurToken = await tokenFor('AUDITEUR');
    lines = await setupLines();
    await collect();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('espèces en caisse', () => {
    it('comptent tous les encaissements en espèces (reprises comprises, pas le Mobile Money), moins les sorties payées en espèces et les versements', async () => {
      expect((await summary()).enCaisse).toBe(150000);

      // Une sortie payée en espèces diminue le tiroir, une sortie par virement non.
      const cash = await createExpense(app, adminToken, {
        categorie: 'FOURNITURES',
        montant: 20000,
        description: 'Craie',
      }).expect(201);
      const wire = await createExpense(app, adminToken, {
        categorie: 'ELECTRICITE',
        montant: 10000,
        description: 'Facture',
      }).expect(201);
      for (const id of [cash.body.id, wire.body.id]) {
        await as(directionToken, http().post(`/expenses/${id}/approve`)).expect(
          201,
        );
      }
      await as(adminToken, http().post(`/expenses/${cash.body.id}/disburse`))
        .field('payload', JSON.stringify({ modePaiement: 'ESPECES' }))
        .expect(201);
      await as(adminToken, http().post(`/expenses/${wire.body.id}/disburse`))
        .field(
          'payload',
          JSON.stringify({ modePaiement: 'VIREMENT', reference: 'VIR-1' }),
        )
        .expect(201);
      expect((await summary()).enCaisse).toBe(130000);

      await declare(adminToken, { montant: 30000 }).expect(201);
      const s = await summary();
      expect(s.enCaisse).toBe(100000);
      expect(s.verse).toBe(30000);
      expect(s.aVerifier).toEqual({ count: 1, total: 30000 });
    });
  });

  describe('déclaration avec bordereau', () => {
    it('enregistre un versement EN_ATTENTE sans jamais exposer le nom du fichier stocké', async () => {
      const res = await declare(adminToken, {
        note: 'Recette de la semaine',
      }).expect(201);
      expect(res.body).toMatchObject({
        statut: 'EN_ATTENTE',
        montant: 30000,
        banque: 'Banque Centrale',
        numeroBordereau: 'BV-0001',
        nomAffiche: 'bordereau.pdf',
        mimeType: 'application/pdf',
      });
      expect(res.body.declarePar.id).toBe(adminId);
      expect(JSON.stringify(res.body)).not.toMatch(
        /"fichier"|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/,
      );
    });

    it('refuse sans bordereau (multipart comme JSON), avec un fichier qui n’est pas un PDF ou une image, et ne laisse rien', async () => {
      await declare(adminToken, {}, { file: false }).expect(400);
      await as(adminToken, http().post('/bank-deposits'))
        .send({
          montant: 30000,
          dateVersement: today(),
          banque: 'Banque Centrale',
          numeroBordereau: 'BV-0002',
        })
        .expect(400);
      const before = readdirSync(FILES_DIR).length;
      await as(adminToken, http().post('/bank-deposits'))
        .field(
          'payload',
          JSON.stringify({
            montant: 30000,
            dateVersement: today(),
            banque: 'Banque Centrale',
            numeroBordereau: 'BV-0003',
          }),
        )
        .attach('bordereau', Buffer.from('MZ-un-executable'), 'bordereau.pdf')
        .expect(400);
      expect(readdirSync(FILES_DIR).length).toBe(before);
      expect(await prisma.bankDeposit.count()).toBe(0);
    });

    it('refuse un autre nom de champ, un montant nul, une date future ou mal écrite, une banque trop courte', async () => {
      await as(adminToken, http().post('/bank-deposits'))
        .field(
          'payload',
          JSON.stringify({
            montant: 30000,
            dateVersement: today(),
            banque: 'Banque',
            numeroBordereau: 'BV-9',
          }),
        )
        .attach('autre', PDF_BYTES, 'x.pdf')
        .expect(400);
      await declare(adminToken, { montant: 0 }).expect(400);
      await declare(adminToken, { montant: 100.5 }).expect(400);
      await declare(adminToken, { dateVersement: '2999-01-01' }).expect(400);
      await declare(adminToken, { dateVersement: '12/10/2026' }).expect(400);
      await declare(adminToken, { dateVersement: '2026-13-45' }).expect(400);
      await declare(adminToken, { banque: 'X' }).expect(400);
      await declare(adminToken, { numeroBordereau: '' }).expect(400);
      expect(await prisma.bankDeposit.count()).toBe(0);
    });

    it('refuse un montant au-delà des espèces en caisse, y compris cumulé avec un versement déjà déclaré', async () => {
      await declare(adminToken, { montant: 150001 }).expect(409);
      await declare(adminToken, {
        montant: 130000,
        numeroBordereau: 'BV-A',
      }).expect(201);
      const refused = await declare(adminToken, {
        montant: 30000,
        numeroBordereau: 'BV-B',
      });
      expect(refused.status).toBe(409);
      expect(refused.body.message).toMatch(/20000/);
      expect(await prisma.bankDeposit.count()).toBe(1);
    });

    it('refuse un bordereau déjà déclaré pour la même banque (casse et espaces ignorés), l’accepte pour une autre banque', async () => {
      await declare(adminToken, {
        montant: 10000,
        numeroBordereau: 'BV-0001',
      }).expect(201);
      await declare(adminToken, {
        montant: 10000,
        numeroBordereau: ' bv-0001 ',
        banque: 'banque centrale',
      }).expect(409);
      await declare(adminToken, {
        montant: 10000,
        numeroBordereau: 'BV-0001',
        banque: 'Autre Banque',
      }).expect(201);
    });

    it('deux déclarations simultanées du même bordereau : une seule passe', async () => {
      const results = await Promise.all([
        declare(adminToken, { montant: 10000, numeroBordereau: 'BV-X' }),
        declare(secretaireToken, { montant: 10000, numeroBordereau: 'BV-X' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.bankDeposit.count()).toBe(1);
    });

    it('journalise la déclaration sans le nom du fichier stocké', async () => {
      const res = await declare(adminToken).expect(201);
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'BANK_DEPOSIT_CREATE', entiteId: res.body.id },
      });
      expect(log.userId).toBe(adminId);
      expect(JSON.stringify(log)).not.toMatch(/[0-9a-f-]{36}\.pdf/);
    });
  });

  describe('droits', () => {
    it('déclarent : Administrateur, Comptable, Secrétaire-caissier ; pas la Direction ni l’Auditeur', async () => {
      await declare(adminToken, {
        numeroBordereau: 'A1',
        montant: 1000,
      }).expect(201);
      await declare(comptableToken, {
        numeroBordereau: 'A2',
        montant: 1000,
      }).expect(201);
      await declare(secretaireToken, {
        numeroBordereau: 'A3',
        montant: 1000,
      }).expect(201);
      await declare(directionToken).expect(403);
      await declare(auditeurToken).expect(403);
      await http().post('/bank-deposits').expect(401);
    });

    it('lisent : les profils de la clôture (CASH_CLOSE), pas l’Auditeur', async () => {
      await as(secretaireToken, http().get('/bank-deposits')).expect(200);
      await as(directionToken, http().get('/bank-deposits/summary')).expect(
        200,
      );
      await as(auditeurToken, http().get('/bank-deposits')).expect(403);
      await as(auditeurToken, http().get('/bank-deposits/summary')).expect(403);
      await http().get('/bank-deposits').expect(401);
    });

    it('vérifient : la Direction seulement, jamais l’Administrateur ni le Comptable', async () => {
      const d = await declare(adminToken).expect(201);
      await as(
        adminToken,
        http().post(`/bank-deposits/${d.body.id}/confirm`),
      ).expect(403);
      await as(
        comptableToken,
        http().post(`/bank-deposits/${d.body.id}/confirm`),
      ).expect(403);
      await as(
        secretaireToken,
        http().post(`/bank-deposits/${d.body.id}/reject`),
      )
        .send({ motif: 'Non' })
        .expect(403);
    });

    it('le droit de vérifier est réservé : l’Administrateur ne peut pas l’accorder à un rôle', async () => {
      const role = await prisma.role.create({
        data: { code: 'TEST_ROLE', nom: 'Test', description: 't' },
      });
      await as(adminToken, http().put(`/roles/${role.id}/permissions`))
        .send({ permissionCodes: ['BANK_DEPOSIT_VERIFY'] })
        .expect(403);
    });
  });

  describe('vérification par une deuxième personne', () => {
    it('la Direction confirme ; une seconde vérification est refusée et un versement confirmé ne change plus', async () => {
      const d = await declare(adminToken).expect(201);
      const res = await as(
        directionToken,
        http().post(`/bank-deposits/${d.body.id}/confirm`),
      ).expect(201);
      expect(res.body.statut).toBe('CONFIRME');
      expect(res.body.verifiePar.id).toBeTruthy();
      expect(res.body.dateVerification).toBeTruthy();
      await as(
        directionToken,
        http().post(`/bank-deposits/${d.body.id}/confirm`),
      ).expect(409);
      await as(
        directionToken,
        http().post(`/bank-deposits/${d.body.id}/reject`),
      )
        .send({ motif: 'Trop tard' })
        .expect(409);
      expect((await summary()).confirmes).toEqual({ count: 1, total: 30000 });
    });

    it('celui qui a déclaré ne vérifie pas son propre versement, même s’il en a le droit', async () => {
      const both = await customToken('CUMUL_TEST', [
        'CASH_CLOSE',
        'BANK_DEPOSIT_CREATE',
        'BANK_DEPOSIT_VERIFY',
      ]);
      const d = await declare(both.token).expect(201);
      const self = await as(
        both.token,
        http().post(`/bank-deposits/${d.body.id}/confirm`),
      );
      expect(self.status).toBe(403);
      await as(both.token, http().post(`/bank-deposits/${d.body.id}/reject`))
        .send({ motif: 'Non' })
        .expect(403);
      expect(
        (
          await prisma.bankDeposit.findUniqueOrThrow({
            where: { id: d.body.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
      await as(
        directionToken,
        http().post(`/bank-deposits/${d.body.id}/confirm`),
      ).expect(201);
    });

    it('le rejet exige un motif, rend le montant à la caisse et libère le numéro de bordereau', async () => {
      const d = await declare(adminToken, { montant: 40000 }).expect(201);
      expect((await summary()).enCaisse).toBe(110000);
      await as(
        directionToken,
        http().post(`/bank-deposits/${d.body.id}/reject`),
      )
        .send({})
        .expect(400);
      const res = await as(
        directionToken,
        http().post(`/bank-deposits/${d.body.id}/reject`),
      )
        .send({ motif: 'Le montant ne correspond pas au relevé' })
        .expect(201);
      expect(res.body.statut).toBe('REJETE');
      expect(res.body.motifRejet).toBe(
        'Le montant ne correspond pas au relevé',
      );
      const s = await summary();
      expect(s.enCaisse).toBe(150000);
      expect(s.rejetes).toEqual({ count: 1, total: 40000 });
      expect(s.aVerifier).toEqual({ count: 0, total: 0 });

      // Le même bordereau peut être redéclaré, avec le bon montant.
      await declare(adminToken, { montant: 35000 }).expect(201);
    });

    it('deux vérifications simultanées : une seule passe', async () => {
      const second = await customToken('DIRECTION_BIS', [
        'CASH_CLOSE',
        'BANK_DEPOSIT_VERIFY',
      ]);
      const d = await declare(adminToken).expect(201);
      const results = await Promise.all([
        as(directionToken, http().post(`/bank-deposits/${d.body.id}/confirm`)),
        as(second.token, http().post(`/bank-deposits/${d.body.id}/confirm`)),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('journalise chaque étape', async () => {
      const d = await declare(adminToken).expect(201);
      await as(
        directionToken,
        http().post(`/bank-deposits/${d.body.id}/confirm`),
      ).expect(201);
      const actions = (
        await prisma.auditLog.findMany({
          where: { entite: 'BankDeposit', entiteId: d.body.id },
          orderBy: { createdAt: 'asc' },
        })
      ).map((l) => l.action);
      expect(actions).toEqual(['BANK_DEPOSIT_CREATE', 'BANK_DEPOSIT_CONFIRM']);
    });
  });

  describe('bordereau', () => {
    it('se lit avec un jeton, avec le bon type, jamais depuis l’adresse publique des fichiers', async () => {
      const d = await declare(adminToken).expect(201);
      const res = await as(
        secretaireToken,
        http().get(`/bank-deposits/${d.body.id}/receipt`),
      )
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toMatch(/no-store/);
      expect((res.body as Buffer).equals(PDF_BYTES)).toBe(true);

      const stored = await prisma.bankDeposit.findUniqueOrThrow({
        where: { id: d.body.id },
      });
      await http().get(`/bank-deposits/${d.body.id}/receipt`).expect(401);
      await as(
        auditeurToken,
        http().get(`/bank-deposits/${d.body.id}/receipt`),
      ).expect(403);
      await as(adminToken, http().get('/bank-deposits/inconnu/receipt')).expect(
        404,
      );
      await http().get(`/uploads/${stored.fichier}`).expect(404);
      await http()
        .get(`/private-uploads/deposits/${stored.fichier}`)
        .expect(404);
    });
  });

  describe('clôture de journée et tableau de bord', () => {
    it('montrent les versements du jour et les espèces en caisse, sans toucher au solde des fonds', async () => {
      const before = await closing();
      expect(before.especes.enCaisse).toBe(150000);
      const fonds = before.soldeCumule;

      const d = await declare(adminToken, { montant: 30000 }).expect(201);
      const c = await closing();
      expect(c.versements.jour).toEqual({ count: 1, total: 30000 });
      expect(c.versements.aVerifier).toEqual({ count: 1, total: 30000 });
      expect(c.especes.enCaisse).toBe(120000);
      expect(c.soldeCumule).toBe(fonds);
      expect(c.sorties.total).toBe(0);

      const dash = await as(
        adminToken,
        http().get('/reports/dashboard'),
      ).expect(200);
      expect(dash.body.versements).toEqual({
        especesEnCaisse: 120000,
        aVerifierCount: 1,
        aVerifierTotal: 30000,
        confirmesTotal: 0,
      });
      expect(dash.body.depenses.totalDecaisse).toBe(0);

      await as(
        directionToken,
        http().post(`/bank-deposits/${d.body.id}/reject`),
      )
        .send({ motif: 'Erreur' })
        .expect(201);
      const after = await closing();
      expect(after.versements.jour).toEqual({ count: 0, total: 0 });
      expect(after.especes.enCaisse).toBe(150000);
    });

    it('un versement daté d’un autre jour n’est compté que dans la caisse de la fin de ce jour et des suivants', async () => {
      const hier = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      await declare(adminToken, {
        montant: 25000,
        dateVersement: hier,
      }).expect(201);
      const jourHier = await closing(hier);
      expect(jourHier.versements.jour).toEqual({ count: 1, total: 25000 });
      const aujourdhui = await closing();
      expect(aujourdhui.versements.jour).toEqual({ count: 0, total: 0 });
      expect(aujourdhui.especes.enCaisse).toBe(125000);
    });
  });

  describe('migration des droits', () => {
    async function runPermissionPart() {
      const sql = readFileSync(
        join(
          __dirname,
          '../prisma/migrations/20261006080000_versements_banque/migration.sql',
        ),
        'utf8',
      );
      const part = sql.slice(sql.indexOf('-- Droits du versement en banque'));
      const statements = part
        .split(/;\s*\n/)
        .map((s) =>
          s
            .split('\n')
            .filter((l) => !l.trim().startsWith('--'))
            .join('\n')
            .trim(),
        )
        .filter(Boolean);
      expect(statements.length).toBe(3);
      for (const s of statements) await prisma.$executeRawUnsafe(s);
    }
    const holders = async (code: string) =>
      (
        await prisma.rolePermission.findMany({
          where: { permission: { code } },
          include: { role: true },
        })
      )
        .map((rp) => rp.role.code)
        .sort();

    it('donne le droit de déclarer à tout rôle qui encaisse ou saisit des sorties, et de vérifier à tout rôle qui approuve les sorties, et rien d’autre', async () => {
      expect(await holders('BANK_DEPOSIT_CREATE')).toEqual([
        'ADMINISTRATEUR',
        'COMPTABLE',
        'SECRETAIRE_CAISSIER',
      ]);
      expect(await holders('BANK_DEPOSIT_VERIFY')).toEqual(['DIRECTION']);

      // Base de production : droits absents, rôle Promoteur sur mesure qui approuve les sorties et encaisse.
      await prisma.rolePermission.deleteMany({
        where: {
          permission: {
            code: { in: ['BANK_DEPOSIT_CREATE', 'BANK_DEPOSIT_VERIFY'] },
          },
        },
      });
      await prisma.permission.deleteMany({
        where: { code: { in: ['BANK_DEPOSIT_CREATE', 'BANK_DEPOSIT_VERIFY'] } },
      });
      const promoter = await prisma.role.create({
        data: { code: 'PRO', nom: 'Promoteur', description: 't' },
      });
      const held = await prisma.permission.findMany({
        where: { code: { in: ['PAYMENT_CREATE', 'EXPENSE_APPROVE'] } },
      });
      await prisma.rolePermission.createMany({
        data: held.map((p) => ({ roleId: promoter.id, permissionId: p.id })),
      });

      await runPermissionPart();
      await runPermissionPart();
      expect(await holders('BANK_DEPOSIT_CREATE')).toEqual([
        'ADMINISTRATEUR',
        'COMPTABLE',
        'PRO',
        'SECRETAIRE_CAISSIER',
      ]);
      expect(await holders('BANK_DEPOSIT_VERIFY')).toEqual([
        'DIRECTION',
        'PRO',
      ]);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { PDF_BYTES, PNG_BYTES, createExpense } from './utils/expenses';

jest.setTimeout(30000);

const FILES_DIR = join(process.cwd(), 'private-uploads', 'expenses');

describe('Sorties financières : demande, approbation, décaissement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let schoolId: string;
  let adminToken: string;
  let directionToken: string;
  let comptableToken: string;
  let secretaireToken: string;
  let auditeurToken: string;

  async function login(email: string, motDePasse: string) {
    const res = await request(app.getHttpServer())
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

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const school = await seedBaseFixtures(prisma);
    schoolId = school.id;
    adminToken = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
    directionToken = await tokenFor('DIRECTION');
    comptableToken = await tokenFor('COMPTABLE');
    secretaireToken = await tokenFor('SECRETAIRE_CAISSIER');
    auditeurToken = await tokenFor('AUDITEUR');
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (token: string, req: request.Test) =>
    req.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());

  const base = {
    categorie: 'FOURNITURES',
    montant: 50000,
    description: 'Craie et cahiers',
  };

  async function newRequest(
    token = adminToken,
    body: Record<string, unknown> = base,
  ) {
    const res = await createExpense(app, token, body).expect(201);
    return res.body as { id: string; statut: string };
  }
  async function approved(token = adminToken) {
    const created = await newRequest(token);
    await as(
      directionToken,
      http().post(`/expenses/${created.id}/approve`),
    ).expect(201);
    return created;
  }
  const disburse = (token: string, id: string, payload: object) =>
    as(token, http().post(`/expenses/${id}/disburse`)).field(
      'payload',
      JSON.stringify(payload),
    );
  const today = () => new Date().toISOString().slice(0, 10);
  const closing = async () =>
    (
      await as(
        adminToken,
        http().get(`/reports/cash-closing?date=${today()}`),
      ).expect(200)
    ).body;

  describe('demande avec justificatif', () => {
    it('enregistre une demande EN_ATTENTE avec sa pièce, sans jamais exposer le nom du fichier stocké', async () => {
      const res = await createExpense(app, adminToken, {
        ...base,
        beneficiaire: 'Librairie Centrale',
      }).expect(201);
      expect(res.body.statut).toBe('EN_ATTENTE');
      expect(res.body.beneficiaire).toBe('Librairie Centrale');
      expect(res.body.attachments).toHaveLength(1);
      expect(res.body.attachments[0]).toMatchObject({
        kind: 'JUSTIFICATIF',
        nomAffiche: 'devis-1.pdf',
        mimeType: 'application/pdf',
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /"fichier"|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/,
      );
      expect(res.body.dateDecaissement).toBeNull();
    });

    it('refuse une demande sans justificatif (400), en multipart comme en JSON, et ne crée rien', async () => {
      await createExpense(app, adminToken, base, { files: 0 }).expect(400);
      await as(adminToken, http().post('/expenses')).send(base).expect(400);
      expect(await prisma.expense.count()).toBe(0);
    });

    it('accepte jusqu’à 5 pièces, pas 6', async () => {
      const five = await createExpense(app, adminToken, base, {
        files: 5,
      }).expect(201);
      expect(five.body.attachments).toHaveLength(5);
      await createExpense(app, adminToken, base, { files: 6 }).expect(400);
      expect(await prisma.expense.count()).toBe(1);
    });

    it('reconnaît le type d’une pièce dans son contenu, jamais dans son nom, et ne laisse aucun fichier derrière un refus', async () => {
      const before = readdirSync(FILES_DIR).length;
      const fake = await as(adminToken, http().post('/expenses'))
        .field('payload', JSON.stringify(base))
        .attach('justificatif', PDF_BYTES, 'bon.pdf')
        .attach('justificatif', Buffer.from('MZ-un-executable'), 'devis.pdf');
      expect(fake.status).toBe(400);
      expect(readdirSync(FILES_DIR).length).toBe(before);
      expect(await prisma.expense.count()).toBe(0);

      const png = await as(adminToken, http().post('/expenses'))
        .field('payload', JSON.stringify(base))
        .attach('justificatif', PNG_BYTES, 'photo-sans-extension');
      expect(png.status).toBe(201);
      expect(png.body.attachments[0].mimeType).toBe('image/png');
    });

    it('refuse un fichier joint sous un autre nom de champ', async () => {
      await as(adminToken, http().post('/expenses'))
        .field('payload', JSON.stringify(base))
        .attach('autre', PDF_BYTES, 'devis.pdf')
        .expect(400);
    });

    it('accepte les catégories d’une école et le versement en banque, refuse l’inconnu et les anciennes', async () => {
      for (const categorie of [
        'ELECTRICITE',
        'SALAIRES_ENSEIGNANTS',
        'TRAVAUX_CONSTRUCTION',
        'VERSEMENT_BANQUE',
        'AUTRE',
      ]) {
        await createExpense(app, adminToken, { ...base, categorie }).expect(
          201,
        );
      }
      for (const categorie of [
        'INVENTEE',
        'PAIEMENT_SALAIRE',
        'PAIEMENT_FACTURE',
        'ACHAT_MATERIEL',
      ]) {
        await createExpense(app, adminToken, { ...base, categorie }).expect(
          400,
        );
      }
    });

    it('refuse un montant nul, une description vide et une date illisible', async () => {
      await createExpense(app, adminToken, { ...base, montant: 0 }).expect(400);
      await createExpense(app, adminToken, { ...base, description: '' }).expect(
        400,
      );
      await createExpense(app, adminToken, {
        ...base,
        dateDepense: 'pas-une-date',
      }).expect(400);
    });

    it('journalise la demande, sans jamais le nom du fichier stocké', async () => {
      const created = await newRequest();
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'EXPENSE_CREATE', entiteId: created.id },
      });
      expect(JSON.stringify(log)).not.toMatch(/[0-9a-f-]{36}\.pdf/);
    });
  });

  describe('droits', () => {
    it('la secrétaire-caissière et la Direction ne saisissent pas de sortie (EXPENSE_CREATE)', async () => {
      await createExpense(app, secretaireToken, base).expect(403);
      await createExpense(app, directionToken, base).expect(403);
    });

    it('seuls les profils de la clôture (CASH_CLOSE) lisent les sorties', async () => {
      await as(auditeurToken, http().get('/expenses')).expect(403);
      await as(secretaireToken, http().get('/expenses')).expect(200);
      await http().get('/expenses').expect(401);
    });

    it('Administrateur et Comptable ne valident pas une sortie (EXPENSE_APPROVE)', async () => {
      const created = await newRequest();
      await as(
        adminToken,
        http().post(`/expenses/${created.id}/approve`),
      ).expect(403);
      await as(
        comptableToken,
        http().post(`/expenses/${created.id}/approve`),
      ).expect(403);
    });

    it('la Direction approuve mais ne confirme pas la sortie (EXPENSE_DISBURSE)', async () => {
      const created = await approved();
      await disburse(directionToken, created.id, {
        modePaiement: 'ESPECES',
      }).expect(403);
    });
  });

  describe('approbation', () => {
    it('la Direction approuve, une seconde approbation est refusée (409)', async () => {
      const created = await newRequest();
      const res = await as(
        directionToken,
        http().post(`/expenses/${created.id}/approve`),
      ).expect(201);
      expect(res.body.statut).toBe('APPROUVEE');
      expect(res.body.approbateur).toBeTruthy();
      await as(
        directionToken,
        http().post(`/expenses/${created.id}/approve`),
      ).expect(409);
    });

    it('rejette avec un motif obligatoire', async () => {
      const created = await newRequest();
      await as(directionToken, http().post(`/expenses/${created.id}/reject`))
        .send({})
        .expect(400);
      const res = await as(
        directionToken,
        http().post(`/expenses/${created.id}/reject`),
      )
        .send({ motif: 'Montant à vérifier' })
        .expect(201);
      expect(res.body.statut).toBe('REJETEE');
      expect(res.body.motifRejet).toBe('Montant à vérifier');
    });
  });

  describe('confirmation de la sortie réelle', () => {
    it('une sortie approuvée n’est pas encore comptée : elle attend son décaissement', async () => {
      await approved();
      const c = await closing();
      expect(c.sorties.total).toBe(0);
      expect(c.soldeCumule).toBe(0);
      expect(c.aDecaisser).toEqual({ count: 1, total: 50000 });
    });

    it('le décaissement pose la date (serveur), l’exécutant et le mode, puis la sortie entre dans la clôture', async () => {
      const created = await approved();
      const res = await disburse(adminToken, created.id, {
        modePaiement: 'ESPECES',
      }).expect(201);
      expect(res.body.statut).toBe('DECAISSEE');
      expect(res.body.modeDecaissement).toBe('ESPECES');
      expect(res.body.decaissePar.id).toBeTruthy();
      expect(
        Math.abs(Date.now() - new Date(res.body.dateDecaissement).getTime()),
      ).toBeLessThan(60_000);

      const c = await closing();
      expect(c.sorties.total).toBe(50000);
      expect(c.sorties.count).toBe(1);
      expect(c.soldeJour).toBe(-50000);
      expect(c.soldeCumule).toBe(-50000);
      expect(c.aDecaisser).toEqual({ count: 0, total: 0 });
      expect(c.sorties.items[0]).toMatchObject({
        categorie: 'FOURNITURES',
        modeDecaissement: 'ESPECES',
      });
    });

    it('une date de dépense antérieure ne place pas la sortie dans une journée passée : la clôture suit le décaissement', async () => {
      const created = await createExpense(app, adminToken, {
        ...base,
        dateDepense: '2020-01-15',
      }).expect(201);
      await as(
        directionToken,
        http().post(`/expenses/${created.body.id}/approve`),
      ).expect(201);
      await disburse(adminToken, created.body.id, {
        modePaiement: 'ESPECES',
      }).expect(201);
      const past = await as(
        adminToken,
        http().get('/reports/cash-closing?date=2020-01-15'),
      ).expect(200);
      expect(past.body.sorties.total).toBe(0);
      expect((await closing()).sorties.total).toBe(50000);
    });

    it('celui qui a approuvé ne confirme pas (403), un autre le fait', async () => {
      const both = await prisma.role.create({
        data: { code: 'PROMOTEUR_TEST', nom: 'Promoteur', description: 't' },
      });
      const perms = await prisma.permission.findMany({
        where: {
          code: {
            in: [
              'CASH_CLOSE',
              'EXPENSE_CREATE',
              'EXPENSE_APPROVE',
              'EXPENSE_DISBURSE',
            ],
          },
        },
      });
      await prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: both.id, permissionId: p.id })),
      });
      const { user, motDePasse } = await createUserWithRole(
        prisma,
        schoolId,
        'PROMOTEUR_TEST',
      );
      const promoter = await login(user.email, motDePasse);

      const created = await newRequest(comptableToken);
      // Le promoteur approuve la demande du comptable : il ne la confirmera pas lui-même.
      await as(promoter, http().post(`/expenses/${created.id}/approve`)).expect(
        201,
      );
      const refused = await disburse(promoter, created.id, {
        modePaiement: 'ESPECES',
      });
      expect(refused.status).toBe(403);
      expect(
        (await prisma.expense.findUniqueOrThrow({ where: { id: created.id } }))
          .statut,
      ).toBe('APPROUVEE');

      // Le comptable, qui a fait la demande mais ne l'a pas approuvée, la confirme.
      await disburse(comptableToken, created.id, {
        modePaiement: 'ESPECES',
      }).expect(201);
    });

    it('refuse de confirmer une demande non approuvée, ou déjà confirmée (409)', async () => {
      const pending = await newRequest();
      await disburse(adminToken, pending.id, {
        modePaiement: 'ESPECES',
      }).expect(409);
      const created = await approved();
      await disburse(adminToken, created.id, {
        modePaiement: 'ESPECES',
      }).expect(201);
      await disburse(adminToken, created.id, {
        modePaiement: 'ESPECES',
      }).expect(409);
      expect((await closing()).sorties.total).toBe(50000);
    });

    it('exige une référence hors espèces, accepte une preuve de paiement en fichier', async () => {
      const created = await approved();
      await disburse(adminToken, created.id, {
        modePaiement: 'VIREMENT',
      }).expect(400);
      await disburse(adminToken, created.id, { modePaiement: 'TROC' }).expect(
        400,
      );
      expect(
        (await prisma.expense.findUniqueOrThrow({ where: { id: created.id } }))
          .statut,
      ).toBe('APPROUVEE');

      const res = await disburse(adminToken, created.id, {
        modePaiement: 'VIREMENT',
        reference: 'VIR-2026-0042',
      })
        .attach('preuve', PDF_BYTES, 'avis-de-virement.pdf')
        .expect(201);
      expect(res.body.referenceDecaissement).toBe('VIR-2026-0042');
      expect(
        res.body.attachments.map((a: { kind: string }) => a.kind).sort(),
      ).toEqual(['JUSTIFICATIF', 'PREUVE_DECAISSEMENT']);
    });

    it('une preuve illisible refuse la confirmation et laisse la sortie à décaisser', async () => {
      const created = await approved();
      const before = readdirSync(FILES_DIR).length;
      await disburse(adminToken, created.id, { modePaiement: 'ESPECES' })
        .attach('preuve', Buffer.from('pas-un-pdf'), 'preuve.pdf')
        .expect(400);
      expect(readdirSync(FILES_DIR).length).toBe(before);
      expect(
        (await prisma.expense.findUniqueOrThrow({ where: { id: created.id } }))
          .statut,
      ).toBe('APPROUVEE');
    });

    it('deux confirmations simultanées : une seule passe, la sortie n’est comptée qu’une fois', async () => {
      const created = await approved();
      const results = await Promise.all([
        disburse(adminToken, created.id, { modePaiement: 'ESPECES' }),
        disburse(comptableToken, created.id, { modePaiement: 'ESPECES' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect((await closing()).sorties.total).toBe(50000);
    });

    it('un versement en banque réduit le solde de caisse sans compter comme charge', async () => {
      const created = await createExpense(app, adminToken, {
        categorie: 'VERSEMENT_BANQUE',
        montant: 100000,
        description: 'Dépôt de la semaine',
      }).expect(201);
      await as(
        directionToken,
        http().post(`/expenses/${created.body.id}/approve`),
      ).expect(201);
      await disburse(adminToken, created.body.id, {
        modePaiement: 'ESPECES',
      }).expect(201);
      const other = await approved();
      await disburse(adminToken, other.id, { modePaiement: 'ESPECES' }).expect(
        201,
      );

      const c = await closing();
      expect(c.sorties.total).toBe(150000);
      expect(c.sorties.versementsBanque).toBe(100000);
      expect(c.sorties.charges).toBe(50000);
      expect(c.soldeCumule).toBe(-150000);

      const dash = await as(
        adminToken,
        http().get('/reports/dashboard'),
      ).expect(200);
      expect(dash.body.depenses.totalDecaisse).toBe(50000);
      expect(dash.body.depenses.versementsBanque).toBe(100000);
    });
  });

  describe('annulation', () => {
    it('le demandeur retire sa demande avec un motif ; un autre demandeur ne le peut pas', async () => {
      const created = await newRequest();
      await as(adminToken, http().post(`/expenses/${created.id}/cancel`))
        .send({})
        .expect(400);
      await as(comptableToken, http().post(`/expenses/${created.id}/cancel`))
        .send({ motif: 'Je ne suis pas le demandeur' })
        .expect(403);
      await as(secretaireToken, http().post(`/expenses/${created.id}/cancel`))
        .send({ motif: 'Pas mon rôle' })
        .expect(403);
      const res = await as(
        adminToken,
        http().post(`/expenses/${created.id}/cancel`),
      )
        .send({ motif: 'Fournisseur changé' })
        .expect(201);
      expect(res.body.statut).toBe('ANNULEE');
      expect(res.body.motifAnnulation).toBe('Fournisseur changé');
      expect(res.body.annulePar.id).toBeTruthy();
    });

    it('seul un responsable qui approuve annule une sortie approuvée jamais payée ; elle ne peut plus être confirmée', async () => {
      const created = await approved();
      await as(adminToken, http().post(`/expenses/${created.id}/cancel`))
        .send({ motif: 'Plus nécessaire' })
        .expect(403);
      await as(directionToken, http().post(`/expenses/${created.id}/cancel`))
        .send({ motif: 'Plus nécessaire' })
        .expect(201);
      await disburse(adminToken, created.id, {
        modePaiement: 'ESPECES',
      }).expect(409);
      expect((await closing()).aDecaisser.count).toBe(0);
    });

    it('une sortie décaissée, rejetée ou déjà annulée ne s’annule plus (409)', async () => {
      const paid = await approved();
      await disburse(adminToken, paid.id, { modePaiement: 'ESPECES' }).expect(
        201,
      );
      await as(directionToken, http().post(`/expenses/${paid.id}/cancel`))
        .send({ motif: 'Trop tard' })
        .expect(409);

      const rejected = await newRequest();
      await as(directionToken, http().post(`/expenses/${rejected.id}/reject`))
        .send({ motif: 'Non' })
        .expect(201);
      await as(adminToken, http().post(`/expenses/${rejected.id}/cancel`))
        .send({ motif: 'Retrait' })
        .expect(409);

      const cancelled = await newRequest();
      await as(adminToken, http().post(`/expenses/${cancelled.id}/cancel`))
        .send({ motif: 'Retrait' })
        .expect(201);
      await as(adminToken, http().post(`/expenses/${cancelled.id}/cancel`))
        .send({ motif: 'Encore' })
        .expect(409);
      expect((await closing()).sorties.total).toBe(50000);
    });

    it('une demande annulée n’est ni approuvable ni rejetable', async () => {
      const created = await newRequest();
      await as(adminToken, http().post(`/expenses/${created.id}/cancel`))
        .send({ motif: 'Retrait' })
        .expect(201);
      await as(
        directionToken,
        http().post(`/expenses/${created.id}/approve`),
      ).expect(409);
      await as(directionToken, http().post(`/expenses/${created.id}/reject`))
        .send({ motif: 'Non' })
        .expect(409);
    });
  });

  describe('pièces', () => {
    it('se lisent avec un jeton, avec le bon type et sans interprétation par le navigateur', async () => {
      const created = await newRequest();
      const list = await as(adminToken, http().get('/expenses')).expect(200);
      const attachmentId = list.body[0].attachments[0].id;
      const res = await as(
        secretaireToken,
        http().get(`/expenses/${created.id}/attachments/${attachmentId}`),
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
    });

    it('exigent un jeton et le droit de lire les sorties, et ne sortent jamais de l’adresse publique des fichiers', async () => {
      const created = await newRequest();
      const stored = await prisma.expenseAttachment.findFirstOrThrow({
        where: { expenseId: created.id },
      });
      const path = `/expenses/${created.id}/attachments/${stored.id}`;
      await http().get(path).expect(401);
      await as(auditeurToken, http().get(path)).expect(403);
      await http().get(`/uploads/${stored.fichier}`).expect(404);
      await http()
        .get(`/private-uploads/expenses/${stored.fichier}`)
        .expect(404);
    });

    it('une pièce ne se lit que par la sortie à laquelle elle appartient', async () => {
      const first = await newRequest();
      const second = await newRequest();
      const stored = await prisma.expenseAttachment.findFirstOrThrow({
        where: { expenseId: first.id },
      });
      await as(
        adminToken,
        http().get(`/expenses/${second.id}/attachments/${stored.id}`),
      ).expect(404);
    });
  });

  describe('liste et historique', () => {
    it('filtre par statut et refuse un statut inconnu', async () => {
      const pending = await newRequest();
      const paid = await approved();
      await disburse(adminToken, paid.id, { modePaiement: 'ESPECES' }).expect(
        201,
      );
      const ids = async (statut: string) =>
        (
          await as(adminToken, http().get(`/expenses?statut=${statut}`)).expect(
            200,
          )
        ).body.map((e: { id: string }) => e.id);
      expect(await ids('EN_ATTENTE')).toEqual([pending.id]);
      expect(await ids('DECAISSEE')).toEqual([paid.id]);
      expect(await ids('APPROUVEE')).toEqual([]);
      await as(adminToken, http().get('/expenses?statut=INCONNU')).expect(400);
    });

    it('journalise chaque étape (RG15), avec l’ancien et le nouvel état', async () => {
      const created = await approved();
      await disburse(adminToken, created.id, {
        modePaiement: 'ESPECES',
      }).expect(201);
      const actions = (
        await prisma.auditLog.findMany({
          where: { entite: 'Expense', entiteId: created.id },
          orderBy: { createdAt: 'asc' },
        })
      ).map((l) => l.action);
      expect(actions).toEqual([
        'EXPENSE_CREATE',
        'EXPENSE_APPROVE',
        'EXPENSE_DISBURSE',
      ]);
    });
  });

  describe('migration des sorties existantes', () => {
    async function runMigration() {
      const sql = readFileSync(
        join(
          __dirname,
          '../prisma/migrations/20260928090000_sorties_reprise_et_droit/migration.sql',
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
      expect(statements.length).toBe(3);
      for (const s of statements) await prisma.$executeRawUnsafe(s);
    }

    it('une sortie déjà approuvée devient décaissée à sa date de dépense (les clôtures passées ne changent pas) et le rejeu ne change rien', async () => {
      const admin = await prisma.user.findFirstOrThrow({
        where: { email: 'admin@shakespeareacademy.cg' },
      });
      const old = await prisma.expense.create({
        data: {
          schoolId,
          categorie: 'ACHAT_MATERIEL',
          montant: 7000,
          description: 'Ancienne sortie',
          dateDepense: new Date('2026-09-10T10:00:00Z'),
          statut: 'APPROUVEE',
          effectueParId: admin.id,
          approbateurId: admin.id,
        },
      });
      const waiting = await prisma.expense.create({
        data: {
          schoolId,
          categorie: 'AUTRE',
          montant: 100,
          description: 'En attente',
          effectueParId: admin.id,
        },
      });

      await runMigration();
      await runMigration();

      const migrated = await prisma.expense.findUniqueOrThrow({
        where: { id: old.id },
      });
      expect(migrated.statut).toBe('DECAISSEE');
      expect(migrated.dateDecaissement?.toISOString()).toBe(
        '2026-09-10T10:00:00.000Z',
      );
      expect(migrated.decaisseParId).toBeNull();
      expect(
        (await prisma.expense.findUniqueOrThrow({ where: { id: waiting.id } }))
          .statut,
      ).toBe('EN_ATTENTE');

      const past = await as(
        adminToken,
        http().get('/reports/cash-closing?date=2026-09-10'),
      ).expect(200);
      expect(past.body.sorties.total).toBe(7000);
    });

    it('le droit de confirmer revient à tout rôle qui saisissait déjà des sorties, et à aucun autre', async () => {
      const holders = async () =>
        (
          await prisma.rolePermission.findMany({
            where: { permission: { code: 'EXPENSE_DISBURSE' } },
            include: { role: true },
          })
        )
          .map((rp) => rp.role.code)
          .sort();
      expect(await holders()).toEqual(['ADMINISTRATEUR', 'COMPTABLE']);

      // Base de production : droit absent, rôle sur mesure (Promoteur) qui saisit des sorties.
      await prisma.rolePermission.deleteMany({
        where: { permission: { code: 'EXPENSE_DISBURSE' } },
      });
      await prisma.permission.deleteMany({
        where: { code: 'EXPENSE_DISBURSE' },
      });
      const promoter = await prisma.role.create({
        data: { code: 'PRO', nom: 'Promoteur', description: 't' },
      });
      const create = await prisma.permission.findUniqueOrThrow({
        where: { code: 'EXPENSE_CREATE' },
      });
      await prisma.rolePermission.create({
        data: { roleId: promoter.id, permissionId: create.id },
      });

      await runMigration();
      await runMigration();
      expect(await holders()).toEqual(['ADMINISTRATEUR', 'COMPTABLE', 'PRO']);
    });
  });
});

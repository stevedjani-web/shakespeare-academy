import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentsService } from '../src/payments/payments.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

jest.setTimeout(30000);

describe('Reprise des encaissements d’avant l’application (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payments: PaymentsService;
  let adminToken: string;
  let directionToken: string;
  let adminId: string;
  let ids: { levelId: string; classId: string; yearId: string };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    payments = app.get(PaymentsService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const school = await seedBaseFixtures(prisma);
    adminToken = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
    adminId = (
      await prisma.user.findFirstOrThrow({
        where: { email: 'admin@shakespeareacademy.cg' },
      })
    ).id;
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      school.id,
      'DIRECTION',
    );
    directionToken = await login(user.email, motDePasse);
    ids = await setupStructure();
  });

  afterAll(async () => {
    await app.close();
  });

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

  async function setupStructure() {
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
      montant: 45000,
    });
    return {
      levelId: level.body.id as string,
      classId: klass.body.id as string,
      yearId: year.body.id as string,
    };
  }

  /** Un élève inscrit, donc une facture avec sa ligne « Frais d'inscription » de 45 000 non payée. */
  async function enrolled(nom: string, telephone: string) {
    const student = await as(adminToken, http().post('/students')).send({
      nom,
      prenom: 'Élève',
      sexe: 'F',
      dateNaissance: '2015-04-12',
      responsable: { nom, prenom: 'Parent', telephone, lien: 'Père' },
    });
    const enrollment = await as(adminToken, http().post('/enrollments')).send({
      studentId: student.body.id,
      classId: ids.classId,
      academicYearId: ids.yearId,
    });
    const invoice = await as(
      adminToken,
      http().get(`/invoices/by-enrollment/${enrollment.body.id}`),
    );
    return {
      studentId: student.body.id as string,
      enrollmentId: enrollment.body.id as string,
      invoiceLineId: invoice.body.lines[0].id as string,
    };
  }

  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const today = () => ymd(new Date());
  const yesterdayNoon = () => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return new Date(`${ymd(d)}T12:00:00Z`);
  };
  const closing = async (date: string) =>
    (
      await as(
        adminToken,
        http().get(`/reports/cash-closing?date=${date}`),
      ).expect(200)
    ).body;

  it('enregistre un paiement marqué reprise, à la date d’origine, avec un reçu séquentiel et la ligne soldée', async () => {
    const e = await enrolled('Moukala', '242060000001');
    const date = yesterdayNoon();
    const p = await payments.recordHistorical(
      { invoiceLineId: e.invoiceLineId, montant: 45000, datePaiement: date },
      adminId,
    );
    expect(p.origine).toBe('REPRISE');
    expect(p.modePaiement).toBe('ESPECES');
    expect(p.datePaiement.toISOString()).toBe(date.toISOString());
    expect(p.numeroRecu).toBe('REC-000001');
    expect(p.recuParUserId).toBe(adminId);

    const status = await as(
      adminToken,
      http().get(`/students/${e.studentId}/financial-status`),
    ).expect(200);
    expect(status.body.montantPaye).toBe(45000);
    expect(status.body.montantRestant).toBe(0);
  });

  it('les numéros de reçu restent séquentiels, mélangés aux encaissements normaux', async () => {
    const a = await enrolled('Alpha', '242060000001');
    const b = await enrolled('Bravo', '242060000002');
    const normal = await as(adminToken, http().post('/payments'))
      .send({ invoiceLineId: a.invoiceLineId, montant: 45000 })
      .expect(201);
    expect(normal.body.numeroRecu).toBe('REC-000001');
    expect(normal.body.origine).toBe('APPLICATION');
    const repris = await payments.recordHistorical(
      {
        invoiceLineId: b.invoiceLineId,
        montant: 45000,
        datePaiement: yesterdayNoon(),
      },
      adminId,
    );
    expect(repris.numeroRecu).toBe('REC-000002');
  });

  it('un paiement repris n’entre jamais dans la caisse : ni entrées du jour, ni solde du jour, ni solde cumulé', async () => {
    const a = await enrolled('Alpha', '242060000001');
    const b = await enrolled('Bravo', '242060000002');
    await as(adminToken, http().post('/payments')).send({
      invoiceLineId: a.invoiceLineId,
      montant: 10000,
    });
    const ancien = yesterdayNoon();
    await payments.recordHistorical(
      { invoiceLineId: b.invoiceLineId, montant: 45000, datePaiement: ancien },
      adminId,
    );

    const hier = await closing(ymd(ancien));
    expect(hier.entrees.total).toBe(0);
    expect(hier.entrees.count).toBe(0);
    expect(hier.soldeJour).toBe(0);
    expect(hier.soldeCumule).toBe(0);
    expect(hier.entrees.reprise).toEqual({ count: 1, total: 45000 });

    const auj = await closing(today());
    expect(auj.entrees.total).toBe(10000);
    expect(auj.soldeJour).toBe(10000);
    expect(auj.soldeCumule).toBe(10000);
    expect(auj.entrees.reprise).toEqual({ count: 0, total: 0 });
  });

  it('en revanche il compte dans l’encaissé du tableau de bord, pas dans le solde de caisse', async () => {
    const a = await enrolled('Alpha', '242060000001');
    await payments.recordHistorical(
      {
        invoiceLineId: a.invoiceLineId,
        montant: 45000,
        datePaiement: yesterdayNoon(),
      },
      adminId,
    );
    const dash = await as(adminToken, http().get('/reports/dashboard')).expect(
      200,
    );
    expect(dash.body.financier.totalEncaisse).toBe(45000);
    expect(dash.body.financier.soldeCaisseCumule).toBe(0);
  });

  it('refuse un montant au-delà du solde, une ligne déjà soldée, une facture annulée, une date future, un montant non entier', async () => {
    const e = await enrolled('Moukala', '242060000001');
    const base = {
      invoiceLineId: e.invoiceLineId,
      datePaiement: yesterdayNoon(),
    };
    await expect(
      payments.recordHistorical({ ...base, montant: 45001 }, adminId),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      payments.recordHistorical({ ...base, montant: 0 }, adminId),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      payments.recordHistorical({ ...base, montant: 100.5 }, adminId),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      payments.recordHistorical(
        {
          invoiceLineId: e.invoiceLineId,
          montant: 1000,
          datePaiement: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        },
        adminId,
      ),
    ).rejects.toMatchObject({ status: 400 });

    await payments.recordHistorical({ ...base, montant: 45000 }, adminId);
    await expect(
      payments.recordHistorical({ ...base, montant: 1000 }, adminId),
    ).rejects.toMatchObject({ status: 409 });

    const other = await enrolled('Autre', '242060000009');
    await as(
      adminToken,
      http().post(`/enrollments/${other.enrollmentId}/cancel`),
    )
      .send({ motif: 'Erreur de saisie' })
      .expect(201);
    await expect(
      payments.recordHistorical(
        {
          invoiceLineId: other.invoiceLineId,
          montant: 45000,
          datePaiement: yesterdayNoon(),
        },
        adminId,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await prisma.payment.count()).toBe(1);
  });

  it('aucune route ne permet de créer une reprise : le champ est refusé et la reprise reste réservée au service', async () => {
    const e = await enrolled('Moukala', '242060000001');
    await as(adminToken, http().post('/payments'))
      .send({
        invoiceLineId: e.invoiceLineId,
        montant: 45000,
        origine: 'REPRISE',
      })
      .expect(400);
    expect(await prisma.payment.count()).toBe(0);
  });

  it('le reçu public et le journal indiquent la reprise', async () => {
    const e = await enrolled('Moukala', '242060000001');
    const p = await payments.recordHistorical(
      {
        invoiceLineId: e.invoiceLineId,
        montant: 45000,
        datePaiement: yesterdayNoon(),
      },
      adminId,
    );
    const verify = await http()
      .get(`/payments/verify/${p.verificationToken}`)
      .expect(200);
    expect(verify.body.reprise).toBe(true);

    const normal = await enrolled('Normal', '242060000003');
    const q = await as(adminToken, http().post('/payments'))
      .send({ invoiceLineId: normal.invoiceLineId, montant: 45000 })
      .expect(201);
    const verifyNormal = await http()
      .get(`/payments/verify/${q.body.verificationToken}`)
      .expect(200);
    expect(verifyNormal.body.reprise).toBe(false);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'PAYMENT_CREATE', entiteId: p.id },
    });
    expect(log.userId).toBe(adminId);
    expect((log.nouvelleValeur as { origine: string }).origine).toBe('REPRISE');
  });

  it('une reprise s’annule comme n’importe quel paiement, par un autre responsable, et la ligne redevient à payer', async () => {
    const e = await enrolled('Moukala', '242060000001');
    const p = await payments.recordHistorical(
      {
        invoiceLineId: e.invoiceLineId,
        montant: 45000,
        datePaiement: yesterdayNoon(),
      },
      adminId,
    );
    await as(adminToken, http().post(`/payments/${p.id}/cancel`))
      .send({ motif: 'Mode erroné' })
      .expect(403);
    await as(directionToken, http().post(`/payments/${p.id}/cancel`))
      .send({ motif: 'Mode erroné' })
      .expect(201);
    const status = await as(
      adminToken,
      http().get(`/students/${e.studentId}/financial-status`),
    ).expect(200);
    expect(status.body.montantPaye).toBe(0);
    expect(status.body.montantRestant).toBe(45000);
  });
});

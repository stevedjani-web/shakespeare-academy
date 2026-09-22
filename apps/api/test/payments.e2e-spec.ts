import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

describe('Paiements et reçus (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let directionToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const school = await seedBaseFixtures(prisma);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@shakespeareacademy.cg',
        motDePasse: 'ChangeMe123!',
      })
      .expect(201);
    adminToken = login.body.accessToken;

    const { user, motDePasse } = await createUserWithRole(
      prisma,
      school.id,
      'DIRECTION',
    );
    const dirLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, motDePasse })
      .expect(201);
    directionToken = dirLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${adminToken}`);
  }
  function authDir(req: request.Test) {
    return req.set('Authorization', `Bearer ${directionToken}`);
  }

  async function setupInvoiceLine(
    feeTypeOverrides: Record<string, unknown> = {},
  ) {
    const section = await auth(
      request(app.getHttpServer()).post('/sections'),
    ).send({
      code: 'FR',
      nom: 'Francophone',
    });
    const cycle = await auth(request(app.getHttpServer()).post('/cycles')).send(
      {
        sectionId: section.body.id,
        code: 'PRIMAIRE',
        nom: 'Primaire',
      },
    );
    const level = await auth(request(app.getHttpServer()).post('/levels')).send(
      {
        cycleId: cycle.body.id,
        code: 'CM2',
        nom: 'CM2',
      },
    );
    const year = await auth(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-07-15',
    });
    const klass = await auth(
      request(app.getHttpServer()).post('/classes'),
    ).send({
      levelId: level.body.id,
      academicYearId: year.body.id,
      nom: 'CM2 A',
    });
    const feeType = await auth(
      request(app.getHttpServer()).post('/fee-types'),
    ).send({
      code: 'INSCRIPTION',
      nom: "Frais d'inscription",
      obligatoire: true,
      avecTranches: false,
      ...feeTypeOverrides,
    });
    await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
      academicYearId: year.body.id,
      levelId: level.body.id,
      feeTypeId: feeType.body.id,
      montant: 45000,
    });
    const student = await auth(
      request(app.getHttpServer()).post('/students'),
    ).send({
      nom: 'Moukala',
      prenom: 'Grace',
      sexe: 'F',
      dateNaissance: '2015-04-12',
      responsable: {
        nom: 'Moukala',
        prenom: 'Jean',
        telephone: '242060000001',
        lien: 'Père',
      },
    });
    const enrollment = await auth(
      request(app.getHttpServer()).post('/enrollments'),
    ).send({
      studentId: student.body.id,
      classId: klass.body.id,
      academicYearId: year.body.id,
    });
    const invoice = await auth(
      request(app.getHttpServer()).get(
        `/invoices/by-enrollment/${enrollment.body.id}`,
      ),
    );
    return {
      invoiceLineId: invoice.body.lines[0].id,
      studentId: student.body.id,
    };
  }

  it('encaisse un paiement complet et génère un numéro de reçu séquentiel', async () => {
    const { invoiceLineId } = await setupInvoiceLine();

    const payment = await auth(
      request(app.getHttpServer()).post('/payments'),
    ).send({
      invoiceLineId,
      montant: 45000,
    });
    expect(payment.status).toBe(201);
    expect(payment.body.numeroRecu).toBe('REC-000001');
    expect(payment.body.statut).toBe('VALIDE');
    expect(payment.body.modePaiement).toBe('ESPECES');
  });

  it('D10 : autorise un paiement partiel puis un second paiement qui solde la ligne', async () => {
    const { invoiceLineId } = await setupInvoiceLine();

    const p1 = await auth(request(app.getHttpServer()).post('/payments')).send({
      invoiceLineId,
      montant: 20000,
    });
    expect(p1.status).toBe(201);
    expect(p1.body.numeroRecu).toBe('REC-000001');

    const p2 = await auth(request(app.getHttpServer()).post('/payments')).send({
      invoiceLineId,
      montant: 25000,
    });
    expect(p2.status).toBe(201);
    expect(p2.body.numeroRecu).toBe('REC-000002');

    // Solde désormais nul : un troisième paiement, même minime, est refusé.
    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ invoiceLineId, montant: 1 })
      .expect(409);
  });

  it('refuse un paiement qui dépasse le solde restant (RG08, 400)', async () => {
    const { invoiceLineId } = await setupInvoiceLine();

    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ invoiceLineId, montant: 50000 })
      .expect(400);
  });

  it('MOBILE_MONEY exige une référence externe (400 sans elle)', async () => {
    const { invoiceLineId } = await setupInvoiceLine();

    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ invoiceLineId, montant: 45000, modePaiement: 'MOBILE_MONEY' })
      .expect(400);

    const withRef = await auth(
      request(app.getHttpServer()).post('/payments'),
    ).send({
      invoiceLineId,
      montant: 45000,
      modePaiement: 'MOBILE_MONEY',
      referenceExterne: 'MTN-XYZ-123',
    });
    expect(withRef.status).toBe(201);
    expect(withRef.body.referenceExterne).toBe('MTN-XYZ-123');
  });

  it('refuse d’encaisser un paiement sans la permission PAYMENT_CREATE (403)', async () => {
    const { invoiceLineId } = await setupInvoiceLine();

    await authDir(request(app.getHttpServer()).post('/payments'))
      .send({ invoiceLineId, montant: 45000 })
      .expect(403);
  });

  it('annule un paiement (Direction) — le solde redevient disponible', async () => {
    const { invoiceLineId } = await setupInvoiceLine();
    const payment = await auth(
      request(app.getHttpServer()).post('/payments'),
    ).send({
      invoiceLineId,
      montant: 45000,
    });

    const cancelled = await authDir(
      request(app.getHttpServer()).post(`/payments/${payment.body.id}/cancel`),
    ).send({ motif: 'Erreur de saisie du montant' });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.statut).toBe('ANNULE');
    expect(cancelled.body.motifAnnulation).toMatch(/Erreur de saisie/);

    // Le solde de la ligne redevient disponible : un nouveau paiement complet est accepté.
    const retry = await auth(
      request(app.getHttpServer()).post('/payments'),
    ).send({
      invoiceLineId,
      montant: 45000,
    });
    expect(retry.status).toBe(201);
  });

  it('refuse à Administrateur d’annuler un paiement (403) — Direction uniquement', async () => {
    const { invoiceLineId } = await setupInvoiceLine();
    const payment = await auth(
      request(app.getHttpServer()).post('/payments'),
    ).send({
      invoiceLineId,
      montant: 45000,
    });

    await auth(
      request(app.getHttpServer()).post(`/payments/${payment.body.id}/cancel`),
    )
      .send({ motif: 'Test' })
      .expect(403);
  });

  it('refuse à celui qui a encaissé un paiement de l’annuler lui-même (RG09), même s’il en a le droit', async () => {
    // Un rôle sur mesure qui cumule l'encaissement et l'approbation des annulations.
    const school = await prisma.school.findFirstOrThrow();
    const role = await prisma.role.create({
      data: { code: 'CAISSE_ET_DIRECTION', nom: 'Cumul', description: 'test' },
    });
    const perms = await prisma.permission.findMany({
      where: {
        code: {
          in: [
            'STUDENT_READ',
            'FINANCE_READ',
            'PAYMENT_CREATE',
            'PAYMENT_CANCEL_APPROVE',
          ],
        },
      },
    });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      school.id,
      'CAISSE_ET_DIRECTION',
      {
        email: 'cumul@test.local',
      },
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, motDePasse })
      .expect(201);
    const cumulToken = login.body.accessToken as string;

    const { invoiceLineId } = await setupInvoiceLine();
    const payment = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${cumulToken}`)
      .send({ invoiceLineId, montant: 45000 })
      .expect(201);

    const self = await request(app.getHttpServer())
      .post(`/payments/${payment.body.id}/cancel`)
      .set('Authorization', `Bearer ${cumulToken}`)
      .send({ motif: 'Je m’annule moi-même' });
    expect(self.status).toBe(403);
    expect(self.body.message).toMatch(/vous avez encaissé/);
    expect(
      (
        await prisma.payment.findUniqueOrThrow({
          where: { id: payment.body.id },
        })
      ).statut,
    ).toBe('VALIDE');

    // Un autre responsable (Direction) peut, lui, l'annuler.
    await authDir(
      request(app.getHttpServer()).post(`/payments/${payment.body.id}/cancel`),
    )
      .send({ motif: 'Erreur de saisie' })
      .expect(201);
  });

  it('refuse d’annuler deux fois le même paiement (409)', async () => {
    const { invoiceLineId } = await setupInvoiceLine();
    const payment = await auth(
      request(app.getHttpServer()).post('/payments'),
    ).send({
      invoiceLineId,
      montant: 45000,
    });
    await authDir(
      request(app.getHttpServer()).post(`/payments/${payment.body.id}/cancel`),
    ).send({
      motif: 'Première annulation',
    });
    await authDir(
      request(app.getHttpServer()).post(`/payments/${payment.body.id}/cancel`),
    )
      .send({ motif: 'Deuxième tentative' })
      .expect(409);
  });

  it('D30 : la réimpression d’un reçu est journalisée', async () => {
    const { invoiceLineId } = await setupInvoiceLine();
    const payment = await auth(
      request(app.getHttpServer()).post('/payments'),
    ).send({
      invoiceLineId,
      montant: 45000,
    });

    const reprint = await auth(
      request(app.getHttpServer()).post(`/payments/${payment.body.id}/reprint`),
    );
    expect(reprint.status).toBe(201);
    expect(reprint.body.numeroRecu).toBe(payment.body.numeroRecu);

    const logs = await auth(
      request(app.getHttpServer()).get('/audit-logs?entite=Payment'),
    );
    const actions = logs.body.map((l: { action: string }) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining(['PAYMENT_CREATE', 'PAYMENT_REPRINT']),
    );
  });

  it('refuse d’encaisser sur une facture annulée (409)', async () => {
    const { invoiceLineId, studentId } = await setupInvoiceLine();
    const student = await auth(
      request(app.getHttpServer()).get(`/students/${studentId}`),
    );
    const enrollmentId = student.body.enrollments[0].id;
    await auth(
      request(app.getHttpServer()).post(`/enrollments/${enrollmentId}/cancel`),
    ).send({
      motif: 'Annulation test',
    });

    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ invoiceLineId, montant: 45000 })
      .expect(409);
  });

  it('financial-status reflète un paiement réel (statut passe à SOLVABLE une fois soldé)', async () => {
    const { invoiceLineId, studentId } = await setupInvoiceLine();

    const before = await auth(
      request(app.getHttpServer()).get(
        `/students/${studentId}/financial-status`,
      ),
    );
    expect(before.body.statut).toBe('EN_RETARD');
    expect(before.body.montantPaye).toBe(0);

    await auth(request(app.getHttpServer()).post('/payments')).send({
      invoiceLineId,
      montant: 45000,
    });

    const after = await auth(
      request(app.getHttpServer()).get(
        `/students/${studentId}/financial-status`,
      ),
    );
    expect(after.body.statut).toBe('SOLVABLE');
    expect(after.body.montantPaye).toBe(45000);
    expect(after.body.montantRestant).toBe(0);
  });

  it('liste les paiements d’un élève et d’une ligne de facture', async () => {
    const { invoiceLineId, studentId } = await setupInvoiceLine();
    await auth(request(app.getHttpServer()).post('/payments')).send({
      invoiceLineId,
      montant: 45000,
    });

    const byStudent = await auth(
      request(app.getHttpServer()).get(`/payments?studentId=${studentId}`),
    );
    expect(byStudent.body).toHaveLength(1);

    const byLine = await auth(
      request(app.getHttpServer()).get(
        `/payments?invoiceLineId=${invoiceLineId}`,
      ),
    );
    expect(byLine.body).toHaveLength(1);
  });

  describe('D29 : vérification publique d’un reçu par jeton', () => {
    it('renvoie les informations du reçu sans authentification, via le jeton', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      const created = await auth(
        request(app.getHttpServer()).post('/payments'),
      ).send({
        invoiceLineId,
        montant: 45000,
      });

      const res = await request(app.getHttpServer()).get(
        `/payments/verify/${created.body.verificationToken}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.numeroRecu).toBe(created.body.numeroRecu);
      expect(res.body.montant).toBe(45000);
      expect(res.body.statut).toBe('VALIDE');
      expect(res.body.eleve).toEqual({ nom: 'Moukala', prenom: 'Grace' });
    });

    it('refuse un jeton inconnu (404), sans exiger de jeton d’accès', async () => {
      await request(app.getHttpServer())
        .get('/payments/verify/jeton-invente-au-hasard')
        .expect(404);
    });

    it('ne permet pas de deviner un reçu via son numéro séquentiel', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      const created = await auth(
        request(app.getHttpServer()).post('/payments'),
      ).send({
        invoiceLineId,
        montant: 45000,
      });

      await request(app.getHttpServer())
        .get(`/payments/verify/${created.body.numeroRecu}`)
        .expect(404);
    });
  });
});

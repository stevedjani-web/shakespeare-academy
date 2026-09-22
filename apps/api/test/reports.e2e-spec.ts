import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

describe('Rapports : clôture de journée, élèves insolvables (e2e)', () => {
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

  async function setupInvoiceLine() {
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
    await auth(
      request(app.getHttpServer()).post(
        `/academic-years/${year.body.id}/activate`,
      ),
    );
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

  describe('Clôture de journée', () => {
    it('additionne les entrées (paiements) et sorties (dépenses approuvées) du jour', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      await auth(request(app.getHttpServer()).post('/payments')).send({
        invoiceLineId,
        montant: 20000,
      });

      const expense = await auth(
        request(app.getHttpServer()).post('/expenses'),
      ).send({
        categorie: 'ACHAT_MATERIEL',
        montant: 5000,
        description: 'Fournitures',
      });
      await authDir(
        request(app.getHttpServer()).post(
          `/expenses/${expense.body.id}/approve`,
        ),
      );

      const today = new Date().toISOString().slice(0, 10);
      const closing = await auth(
        request(app.getHttpServer()).get(`/reports/cash-closing?date=${today}`),
      );
      expect(closing.status).toBe(200);
      expect(closing.body.entrees.total).toBe(20000);
      expect(closing.body.sorties.total).toBe(5000);
      expect(closing.body.soldeJour).toBe(15000);
      expect(closing.body.soldeCumule).toBe(15000);
    });

    it('ignore une dépense encore EN_ATTENTE dans le total des sorties', async () => {
      await auth(request(app.getHttpServer()).post('/expenses')).send({
        categorie: 'AUTRE',
        montant: 9999,
        description: 'Non approuvée',
      });
      const today = new Date().toISOString().slice(0, 10);
      const closing = await auth(
        request(app.getHttpServer()).get(`/reports/cash-closing?date=${today}`),
      );
      expect(closing.body.sorties.total).toBe(0);
    });

    it('refuse sans la permission CASH_CLOSE', async () => {
      const school = await prisma.school.findFirstOrThrow();
      const { user, motDePasse } = await createUserWithRole(
        prisma,
        school.id,
        'AUDITEUR',
      );
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, motDePasse });
      await request(app.getHttpServer())
        .get('/reports/cash-closing')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403);
    });
  });

  describe('Élèves insolvables', () => {
    it('liste un élève avec un frais immédiatement exigible non couvert', async () => {
      await setupInvoiceLine();
      const res = await auth(
        request(app.getHttpServer()).get('/reports/insolvent-students'),
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].statut).toBe('EN_RETARD');
      expect(res.body[0].montantExigible).toBe(45000);
      expect(res.body[0].guardian.telephone).toBe('242060000001');
    });

    it('n’inclut pas un élève dont la ligne est entièrement payée', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      await auth(request(app.getHttpServer()).post('/payments')).send({
        invoiceLineId,
        montant: 45000,
      });
      const res = await auth(
        request(app.getHttpServer()).get('/reports/insolvent-students'),
      );
      expect(res.body).toHaveLength(0);
    });
  });

  describe('Statistiques du tableau de bord', () => {
    it('calcule effectifs, finances et remises pour un élève partiellement payé avec remise', async () => {
      const { invoiceLineId } = await setupInvoiceLine();

      const discount = await auth(
        request(app.getHttpServer()).post('/discounts'),
      ).send({
        invoiceLineId,
        type: 'MONTANT_FIXE',
        valeur: 5000,
        motif: 'Fratrie',
      });
      await authDir(
        request(app.getHttpServer()).post(
          `/discounts/${discount.body.id}/approve`,
        ),
      );

      await auth(request(app.getHttpServer()).post('/payments')).send({
        invoiceLineId,
        montant: 20000,
      });

      const res = await auth(
        request(app.getHttpServer()).get('/reports/dashboard'),
      );
      expect(res.status).toBe(200);
      expect(res.body.anneeActive).toBe('2026-2027');
      expect(res.body.effectifs.actifs).toBe(1);
      expect(res.body.effectifs.parSexe).toEqual({ M: 0, F: 1 });
      expect(res.body.inscriptions.nouvelles).toBe(1);
      expect(res.body.financier.totalFacture).toBe(45000);
      expect(res.body.financier.totalRemises).toBe(5000);
      expect(res.body.financier.totalEncaisse).toBe(20000);
      expect(res.body.financier.totalRestantDu).toBe(20000);
      expect(res.body.financier.tauxRecouvrement).toBe(50);
      expect(res.body.paiements.parMode.ESPECES).toBe(20000);
      expect(res.body.remises.approuvees).toBe(1);
      expect(res.body.repartition.parClasse).toEqual([
        expect.objectContaining({ nom: 'CM2 A', effectif: 1 }),
      ]);
      expect(res.body.insolvables.count).toBe(1);
    });

    it('renvoie un taux de recouvrement nul quand aucune facture n’existe', async () => {
      const res = await auth(
        request(app.getHttpServer()).get('/reports/dashboard'),
      );
      expect(res.status).toBe(200);
      expect(res.body.financier.tauxRecouvrement).toBeNull();
      expect(res.body.effectifs.total).toBe(0);
    });
  });

  describe('Exports CSV', () => {
    it('exporte les élèves en CSV avec en-têtes de téléchargement', async () => {
      await setupInvoiceLine();
      const res = await auth(
        request(app.getHttpServer()).get('/reports/export/students'),
      );
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(
        'eleves-par-classe.csv',
      );
      expect(res.text).toContain('Moukala');
      expect(res.text).toContain('CM2 A');
    });

    it('GET /reports/students-by-class renvoie la liste JSON avec classe, section et responsable', async () => {
      const { studentId } = await setupInvoiceLine();
      const res = await auth(
        request(app.getHttpServer()).get('/reports/students-by-class'),
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: studentId,
        classe: 'CM2 A',
        cycle: 'Primaire',
        section: 'Francophone',
        nom: 'Moukala',
        telephoneResponsable: '242060000001',
      });
    });

    it('exporte les élèves insolvables en CSV', async () => {
      await setupInvoiceLine();
      const res = await auth(
        request(app.getHttpServer()).get('/reports/export/insolvent-students'),
      );
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(
        'eleves-insolvables.csv',
      );
      expect(res.text).toContain('Moukala');
      expect(res.text).toContain('45000');
    });
  });
});

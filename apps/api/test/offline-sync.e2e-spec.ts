import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures } from './utils/fixtures';

describe('Synchronisation hors ligne : idempotence et reçus provisoires (e2e)', () => {
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
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@shakespeareacademy.cg', motDePasse: 'ChangeMe123!' })
      .expect(201);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  async function setupInvoiceLine() {
    const section = await auth(request(app.getHttpServer()).post('/sections')).send({ code: 'FR', nom: 'Francophone' });
    const cycle = await auth(request(app.getHttpServer()).post('/cycles')).send({
      sectionId: section.body.id,
      code: 'PRIMAIRE',
      nom: 'Primaire',
    });
    const level = await auth(request(app.getHttpServer()).post('/levels')).send({
      cycleId: cycle.body.id,
      code: 'CM2',
      nom: 'CM2',
    });
    const year = await auth(request(app.getHttpServer()).post('/academic-years')).send({
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-07-15',
    });
    const klass = await auth(request(app.getHttpServer()).post('/classes')).send({
      levelId: level.body.id,
      academicYearId: year.body.id,
      nom: 'CM2 A',
    });
    const feeType = await auth(request(app.getHttpServer()).post('/fee-types')).send({
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
    const student = await auth(request(app.getHttpServer()).post('/students')).send({
      nom: 'Moukala',
      prenom: 'Grace',
      sexe: 'F',
      dateNaissance: '2015-04-12',
      responsable: { nom: 'Moukala', prenom: 'Jean', telephone: '242060000001', lien: 'Père' },
    });
    const enrollment = await auth(request(app.getHttpServer()).post('/enrollments')).send({
      studentId: student.body.id,
      classId: klass.body.id,
      academicYearId: year.body.id,
    });
    const invoice = await auth(request(app.getHttpServer()).get(`/invoices/by-enrollment/${enrollment.body.id}`));
    return { invoiceLineId: invoice.body.lines[0].id as string };
  }

  describe('Idempotency-Key', () => {
    it('rejouer la même requête avec la même clé ne crée qu’une seule sortie et renvoie la même réponse', async () => {
      const body = { categorie: 'ACHAT_MATERIEL', montant: 5000, description: 'Fournitures' };
      const first = await auth(request(app.getHttpServer()).post('/expenses'))
        .set('Idempotency-Key', 'cle-hors-ligne-0001')
        .send(body);
      const second = await auth(request(app.getHttpServer()).post('/expenses'))
        .set('Idempotency-Key', 'cle-hors-ligne-0001')
        .send(body);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      expect(await prisma.expense.count()).toBe(1);
    });

    it('deux clés différentes créent deux sorties', async () => {
      const body = { categorie: 'AUTRE', montant: 1000, description: 'Un' };
      await auth(request(app.getHttpServer()).post('/expenses')).set('Idempotency-Key', 'cle-hors-ligne-0002').send(body);
      await auth(request(app.getHttpServer()).post('/expenses')).set('Idempotency-Key', 'cle-hors-ligne-0003').send(body);
      expect(await prisma.expense.count()).toBe(2);
    });

    it('sans clé, le comportement reste inchangé (deux requêtes, deux sorties)', async () => {
      const body = { categorie: 'AUTRE', montant: 1000, description: 'Un' };
      await auth(request(app.getHttpServer()).post('/expenses')).send(body).expect(201);
      await auth(request(app.getHttpServer()).post('/expenses')).send(body).expect(201);
      expect(await prisma.expense.count()).toBe(2);
    });

    it('refuse une clé déjà utilisée pour une autre route (409) et une clé mal formée (400)', async () => {
      await auth(request(app.getHttpServer()).post('/expenses'))
        .set('Idempotency-Key', 'cle-hors-ligne-0004')
        .send({ categorie: 'AUTRE', montant: 1000, description: 'Un' })
        .expect(201);
      await auth(request(app.getHttpServer()).post('/sections'))
        .set('Idempotency-Key', 'cle-hors-ligne-0004')
        .send({ code: 'X', nom: 'X' })
        .expect(409);
      await auth(request(app.getHttpServer()).post('/expenses'))
        .set('Idempotency-Key', 'court')
        .send({ categorie: 'AUTRE', montant: 1000, description: 'Un' })
        .expect(400);
    });
  });

  describe('Encaissement saisi hors ligne (reçu provisoire)', () => {
    const provisoire = 'PROV-A1B2C3-260921-1';

    it('enregistre le numéro provisoire et l’instant réel de la saisie, le reçu officiel reste attribué par le serveur', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      const saisie = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      const res = await auth(request(app.getHttpServer()).post('/payments')).send({
        invoiceLineId,
        montant: 20000,
        numeroProvisoire: provisoire,
        dateSaisie: saisie,
      });

      expect(res.status).toBe(201);
      expect(res.body.numeroRecu).toBe('REC-000001');
      expect(res.body.numeroProvisoire).toBe(provisoire);
      expect(new Date(res.body.datePaiement).toISOString()).toBe(saisie);
      expect(res.body.saisieHorsLigneAt).toBeTruthy();
    });

    it('un renvoi du même reçu provisoire ne crée jamais un deuxième paiement ni ne consomme un numéro officiel', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      const payload = { invoiceLineId, montant: 20000, numeroProvisoire: provisoire, dateSaisie: new Date().toISOString() };

      const first = await auth(request(app.getHttpServer()).post('/payments')).send(payload);
      const again = await auth(request(app.getHttpServer()).post('/payments')).send(payload);

      expect(again.status).toBe(201);
      expect(again.body.id).toBe(first.body.id);
      expect(await prisma.payment.count()).toBe(1);

      const next = await auth(request(app.getHttpServer()).post('/payments')).send({ invoiceLineId, montant: 1000 });
      expect(next.body.numeroRecu).toBe('REC-000002');
    });

    it('refuse le même numéro provisoire pour un autre montant (409)', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      await auth(request(app.getHttpServer()).post('/payments')).send({
        invoiceLineId,
        montant: 20000,
        numeroProvisoire: provisoire,
        dateSaisie: new Date().toISOString(),
      });
      await auth(request(app.getHttpServer()).post('/payments'))
        .send({ invoiceLineId, montant: 25000, numeroProvisoire: provisoire, dateSaisie: new Date().toISOString() })
        .expect(409);
    });

    it('refuse une date de saisie sans numéro provisoire, dans le futur, ou trop ancienne (400)', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      const day = 24 * 60 * 60 * 1000;

      await auth(request(app.getHttpServer()).post('/payments'))
        .send({ invoiceLineId, montant: 1000, dateSaisie: new Date(Date.now() - day).toISOString() })
        .expect(400);
      await auth(request(app.getHttpServer()).post('/payments'))
        .send({
          invoiceLineId,
          montant: 1000,
          numeroProvisoire: 'PROV-A1B2C3-260921-2',
          dateSaisie: new Date(Date.now() + 2 * day).toISOString(),
        })
        .expect(400);
      await auth(request(app.getHttpServer()).post('/payments'))
        .send({
          invoiceLineId,
          montant: 1000,
          numeroProvisoire: 'PROV-A1B2C3-260921-3',
          dateSaisie: new Date(Date.now() - 60 * day).toISOString(),
        })
        .expect(400);
      expect(await prisma.payment.count()).toBe(0);
    });

    it('le contrôle du solde (RG08) s’applique toujours à la synchronisation', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      await auth(request(app.getHttpServer()).post('/payments')).send({ invoiceLineId, montant: 40000 }).expect(201);
      await auth(request(app.getHttpServer()).post('/payments'))
        .send({
          invoiceLineId,
          montant: 20000,
          numeroProvisoire: 'PROV-A1B2C3-260921-4',
          dateSaisie: new Date().toISOString(),
        })
        .expect(400);
    });

    it('un format de numéro provisoire invalide est refusé (400)', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      await auth(request(app.getHttpServer()).post('/payments'))
        .send({ invoiceLineId, montant: 1000, numeroProvisoire: 'REC-000999', dateSaisie: new Date().toISOString() })
        .expect(400);
    });
  });
});

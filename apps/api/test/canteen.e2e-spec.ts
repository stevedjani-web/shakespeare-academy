import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

jest.setTimeout(30000);

/**
 * Cantine (30 octobre 2026) : jours payés d'avance (lundi, mardi, jeudi par défaut), vente avec reçu en une seule
 * opération, liste des enfants attendus, annulation qui libère les jours. Année 2026-2027 ; lundi 2 novembre 2026.
 */
describe('Cantine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let secToken: string;
  let comptaToken: string;
  let directionToken: string;
  let cantineToken: string;
  let survToken: string;
  let ids: {
    levelId: string;
    classId: string;
    classId2: string;
    yearId: string;
  };

  // Lundi 2, mardi 3, mercredi 4, jeudi 5, lundi 9 novembre 2026.
  const MON = '2026-11-02';
  const TUE = '2026-11-03';
  const WED = '2026-11-04';
  const THU = '2026-11-05';
  const MON2 = '2026-11-09';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const school = await seedBaseFixtures(prisma);
    adminToken = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
    const tokenOf = async (role: string) => {
      const { user, motDePasse } = await createUserWithRole(
        prisma,
        school.id,
        role,
      );
      return login(user.email!, motDePasse);
    };
    secToken = await tokenOf('SECRETAIRE_CAISSIER');
    comptaToken = await tokenOf('COMPTABLE');
    directionToken = await tokenOf('DIRECTION');
    cantineToken = await tokenOf('CANTINE');
    survToken = await tokenOf('SURVEILLANT');
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
    const klass2 = await as(adminToken, http().post('/classes')).send({
      levelId: level.body.id,
      academicYearId: year.body.id,
      nom: 'CM2 B',
    });
    const feeType = await as(adminToken, http().post('/fee-types')).send({
      code: 'PENSION',
      nom: 'Pension',
      obligatoire: true,
      avecTranches: false,
    });
    await as(adminToken, http().post('/fee-schedules')).send({
      academicYearId: year.body.id,
      levelId: level.body.id,
      feeTypeId: feeType.body.id,
      montant: 100000,
    });
    return {
      levelId: level.body.id as string,
      classId: klass.body.id as string,
      classId2: klass2.body.id as string,
      yearId: year.body.id as string,
    };
  }

  async function enrolled(nom: string, classId = ids.classId) {
    const student = await as(adminToken, http().post('/students')).send({
      nom,
      prenom: 'Élève',
      sexe: 'F',
      dateNaissance: '2015-04-12',
      responsable: {
        nom,
        prenom: 'Parent',
        telephone: `2420600${Math.floor(Math.random() * 90000 + 10000)}`,
        lien: 'Père',
      },
    });
    const enrollment = await as(adminToken, http().post('/enrollments')).send({
      studentId: student.body.id,
      classId,
      academicYearId: ids.yearId,
    });
    return {
      studentId: student.body.id as string,
      enrollmentId: enrollment.body.id as string,
    };
  }

  const enable = () =>
    as(adminToken, http().patch('/school')).send({ cantineActive: true });

  const sell = (
    token: string,
    studentId: string,
    dates: string[],
    extra: Record<string, unknown> = {},
  ) =>
    as(token, http().post(`/canteen/students/${studentId}/sales`)).send({
      dates,
      totalAttendu: dates.length * 1000,
      modePaiement: 'ESPECES',
      ...extra,
    });

  const overview = (token: string, studentId: string, month = '2026-11') =>
    as(token, http().get(`/canteen/students/${studentId}?month=${month}`));

  const daily = (token: string, date: string) =>
    as(token, http().get(`/canteen/daily?date=${date}`));

  describe('réglages', () => {
    it('éteinte par défaut, avec 1 000 FCFA le jour, lundi, mardi et jeudi', async () => {
      const school = await prisma.school.findFirstOrThrow();
      expect(school.cantineActive).toBe(false);
      expect(school.cantinePrixJourFcfa).toBe(1000);
      expect([...school.cantineJours].sort()).toEqual([1, 2, 4]);
    });

    it("l'Administrateur règle le prix et les jours, c'est journalisé", async () => {
      const res = await as(adminToken, http().patch('/school')).send({
        cantineActive: true,
        cantinePrixJourFcfa: 1500,
        cantineJours: [1, 3, 5],
      });
      expect(res.status).toBe(200);
      const school = await prisma.school.findFirstOrThrow();
      expect(school.cantinePrixJourFcfa).toBe(1500);
      expect([...school.cantineJours].sort()).toEqual([1, 3, 5]);
      const log = await prisma.auditLog.findFirst({
        where: { action: 'SCHOOL_CANTEEN_UPDATE' },
      });
      expect(log).not.toBeNull();
      expect(JSON.stringify(log!.nouvelleValeur)).toContain('1500');
    });

    it('refuse un réglage invalide', async () => {
      for (const body of [
        { cantineJours: [] },
        { cantineJours: [7] },
        { cantineJours: [1, 1] },
        { cantinePrixJourFcfa: 0 },
        { cantinePrixJourFcfa: 12.5 },
      ]) {
        await as(adminToken, http().patch('/school')).send(body).expect(400);
      }
    });

    it('un compte sans droit de réglage ne peut pas modifier la cantine', async () => {
      await as(secToken, http().patch('/school'))
        .send({ cantinePrixJourFcfa: 1 })
        .expect(403);
      await as(cantineToken, http().patch('/school'))
        .send({ cantineActive: true })
        .expect(403);
    });
  });

  describe('vente', () => {
    it("refuse de vendre tant que la cantine n'est pas activée", async () => {
      const { studentId } = await enrolled('Mavoungou');
      await sell(secToken, studentId, [MON]).expect(409);
      const o = await overview(secToken, studentId).expect(200);
      expect(o.body.venteImpossible).toBe('CANTINE_INACTIVE');
    });

    it('vend quatre jours en espèces : ligne, jours, paiement et reçu en une opération', async () => {
      await enable();
      const { studentId, enrollmentId } = await enrolled('Mavoungou');
      const res = await sell(secToken, studentId, [MON, TUE, THU, MON2]);
      expect(res.status).toBe(201);
      expect(res.body.montant).toBe(4000);
      expect(res.body.nombreJours).toBe(4);
      expect(res.body.numeroRecu).toMatch(/^REC-\d{6}$/);
      expect(res.body.libelle).toBe(
        'Cantine — 4 jours (02/11/2026 au 09/11/2026)',
      );

      const days = await prisma.canteenDay.findMany({
        where: { enrollmentId },
        orderBy: { date: 'asc' },
      });
      expect(days.map((d) => d.date.toISOString().slice(0, 10))).toEqual([
        MON,
        TUE,
        THU,
        MON2,
      ]);
      expect(days.every((d) => d.prixFcfa === 1000)).toBe(true);
      const payment = await prisma.payment.findFirstOrThrow({
        where: { numeroRecu: res.body.numeroRecu },
      });
      expect(payment.montant).toBe(4000);
      expect(payment.statut).toBe('VALIDE');
      expect(payment.modePaiement).toBe('ESPECES');
      const line = await prisma.invoiceLine.findUniqueOrThrow({
        where: { id: res.body.ligneId },
        include: { feeType: true },
      });
      expect(line.feeType.code).toBe('CANTINE');
      expect(line.feeType.obligatoire).toBe(false);
      expect(line.montant).toBe(4000);
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'CANTEEN_SALE' },
      });
      expect(audit).not.toBeNull();
    });

    it('la vente se fait aussi par Mobile Money, avec sa référence obligatoire', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      await sell(secToken, studentId, [MON], {
        modePaiement: 'MOBILE_MONEY',
      }).expect(400);
      const ok = await sell(secToken, studentId, [MON], {
        modePaiement: 'MOBILE_MONEY',
        referenceExterne: 'MP123456',
      }).expect(201);
      const payment = await prisma.payment.findFirstOrThrow({
        where: { numeroRecu: ok.body.numeroRecu },
      });
      expect(payment.referenceExterne).toBe('MP123456');
    });

    it('refuse les modes bancaires et les jours qui ne sont pas à vendre', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      await sell(secToken, studentId, [MON], {
        modePaiement: 'VIREMENT',
      }).expect(400);
      // Mercredi : pas un jour de cantine. Samedi aussi.
      await sell(secToken, studentId, [WED]).expect(400);
      await sell(secToken, studentId, ['2026-11-07']).expect(400);
      // Hors année scolaire, date impossible, liste vide.
      await sell(secToken, studentId, ['2028-01-03']).expect(400);
      await sell(secToken, studentId, ['2026-02-30']).expect(400);
      await sell(secToken, studentId, []).expect(400);
      expect(await prisma.canteenDay.count()).toBe(0);
      expect(await prisma.payment.count()).toBe(0);
    });

    it('on peut payer rétroactivement un jour déjà passé', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      await sell(secToken, studentId, ['2026-09-07']).expect(201);
    });

    it('refuse un jour sans classe du calendrier', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      await as(adminToken, http().post('/calendar-events'))
        .send({
          academicYearId: ids.yearId,
          type: 'FERIE',
          libelle: 'Jour férié',
          dateDebut: TUE,
        })
        .expect(201);
      const res = await sell(secToken, studentId, [MON, TUE]);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Jour férié');
      expect(await prisma.canteenDay.count()).toBe(0);
    });

    it('le samedi n’est jamais vendu, même si on le déclare jour de cantine, tant que ce n’est pas un jour de classe', async () => {
      await as(adminToken, http().patch('/school')).send({
        cantineActive: true,
        cantineJours: [1, 6],
      });
      const { studentId } = await enrolled('Mavoungou');
      await sell(secToken, studentId, ['2026-11-07']).expect(400);
    });

    it('ne paie jamais deux fois le même jour', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      await sell(secToken, studentId, [MON, TUE]).expect(201);
      const again = await sell(secToken, studentId, [TUE, THU]);
      expect(again.status).toBe(409);
      expect(await prisma.canteenDay.count()).toBe(2);
      expect(await prisma.payment.count()).toBe(1);
    });

    it('deux ventes simultanées du même jour : une seule passe, aucun reçu perdu', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      const results = await Promise.all([
        sell(secToken, studentId, [MON]),
        sell(comptaToken, studentId, [MON]),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.canteenDay.count()).toBe(1);
      expect(await prisma.payment.count()).toBe(1);
      const seq = await prisma.numberSequence.findFirstOrThrow({
        where: { type: 'RECEIPT' },
      });
      expect(seq.dernierNumero).toBe(1);
    });

    it('le total vu à l’écran est contrôlé : un prix changé entre-temps ne débite rien', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      await as(adminToken, http().patch('/school')).send({
        cantinePrixJourFcfa: 1200,
      });
      const res = await sell(secToken, studentId, [MON, TUE]);
      expect(res.status).toBe(409);
      expect(await prisma.payment.count()).toBe(0);
      const ok = await sell(secToken, studentId, [MON, TUE], {
        totalAttendu: 2400,
      }).expect(201);
      expect(ok.body.montant).toBe(2400);
    });

    it('un changement de prix ne touche jamais les jours déjà payés', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      await sell(secToken, studentId, [MON]).expect(201);
      await as(adminToken, http().patch('/school')).send({
        cantinePrixJourFcfa: 2000,
      });
      const day = await prisma.canteenDay.findFirstOrThrow();
      expect(day.prixFcfa).toBe(1000);
    });

    it('refuse un élève sans inscription active cette année', async () => {
      await enable();
      const student = await as(adminToken, http().post('/students')).send({
        nom: 'Sans',
        prenom: 'Inscription',
        sexe: 'M',
      });
      await sell(secToken, student.body.id, [MON]).expect(422);
      const { studentId, enrollmentId } = await enrolled('Annulee');
      await as(adminToken, http().post(`/enrollments/${enrollmentId}/cancel`))
        .send({ motif: 'Erreur de saisie' })
        .expect(201);
      await sell(secToken, studentId, [MON]).expect(422);
    });

    it('un élève inconnu est refusé', async () => {
      await enable();
      await sell(secToken, 'inconnu', [MON]).expect(404);
    });
  });

  describe('vue de l’élève et clôture', () => {
    it('montre les jours du mois : libre, payé, fermé', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      await sell(secToken, studentId, [MON, THU]).expect(201);
      await as(adminToken, http().post('/calendar-events'))
        .send({
          academicYearId: ids.yearId,
          type: 'VACANCES',
          libelle: 'Congé exceptionnel',
          dateDebut: MON2,
        })
        .expect(201);
      const o = await overview(secToken, studentId).expect(200);
      expect(o.body.venteImpossible).toBeNull();
      const byDate = new Map<string, any>(
        o.body.jours.map((j: any) => [j.date, j]),
      );
      expect(byDate.get(MON).paye).toBe(true);
      expect(byDate.get(TUE).paye).toBe(false);
      expect(byDate.get(THU).paye).toBe(true);
      expect(byDate.get(WED)).toBeUndefined();
      expect(byDate.get(MON2).ferme).toBe(true);
      expect(byDate.get(MON2).motifFermeture).toBe('Congé exceptionnel');
      expect(o.body.achats).toHaveLength(1);
      expect(o.body.achats[0].jours).toEqual([MON, THU]);
      expect(o.body.achats[0].paiement.numeroRecu).toMatch(/^REC-/);
    });

    it('un jour payé puis fermé est signalé fermé, sans report automatique', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      await sell(secToken, studentId, [MON2]).expect(201);
      await as(adminToken, http().post('/calendar-events'))
        .send({
          academicYearId: ids.yearId,
          type: 'AUTRE',
          libelle: 'Fermeture exceptionnelle',
          dateDebut: MON2,
        })
        .expect(201);
      const o = await overview(secToken, studentId).expect(200);
      const j = o.body.jours.find((x: any) => x.date === MON2);
      expect(j.paye).toBe(true);
      expect(j.ferme).toBe(true);
      expect(await prisma.canteenDay.count()).toBe(1);
    });

    it('la clôture de journée montre la part cantine, comptée dans le total et pas en plus', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      await sell(secToken, studentId, [MON, TUE, THU]).expect(201);
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Brazzaville',
      }).format(new Date());
      const res = await as(
        adminToken,
        http().get(`/reports/cash-closing?date=${today}`),
      ).expect(200);
      expect(res.body.entrees.total).toBe(3000);
      expect(res.body.entrees.cantine).toEqual({ count: 1, total: 3000 });
    });

    it('la cantine ne rend jamais un élève insolvable et ne gonfle pas le facturé', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      const before = await as(
        adminToken,
        http().get(`/students/${studentId}/financial-status`),
      ).expect(200);
      await sell(secToken, studentId, [MON, TUE]).expect(201);
      const after = await as(
        adminToken,
        http().get(`/students/${studentId}/financial-status`),
      ).expect(200);
      expect(after.body.statut).toBe(before.body.statut);
      expect(after.body.montantRestant).toBe(before.body.montantRestant);
      expect(after.body.montantPaye).toBe(before.body.montantPaye + 2000);
    });
  });

  describe('liste du jour', () => {
    it('liste les enfants attendus par classe, sans donnée financière', async () => {
      await enable();
      const a = await enrolled('Alpha');
      const b = await enrolled('Bravo');
      const c = await enrolled('Charlie', ids.classId2);
      await enrolled('Delta');
      await sell(secToken, a.studentId, [MON, TUE]).expect(201);
      await sell(secToken, b.studentId, [MON]).expect(201);
      await sell(comptaToken, c.studentId, [MON]).expect(201);

      const res = await daily(cantineToken, MON).expect(200);
      expect(res.body.total).toBe(3);
      expect(res.body.estJourCantine).toBe(true);
      expect(res.body.ferme).toBeNull();
      expect(res.body.classes.map((k: any) => k.classe)).toEqual([
        'CM2 A',
        'CM2 B',
      ]);
      expect(res.body.classes[0].eleves.map((e: any) => e.nom)).toEqual([
        'Alpha',
        'Bravo',
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/montant|numeroRecu/);

      const tue = await daily(cantineToken, TUE).expect(200);
      expect(tue.body.total).toBe(1);
      const wed = await daily(cantineToken, WED).expect(200);
      expect(wed.body.total).toBe(0);
      expect(wed.body.estJourCantine).toBe(false);
    });

    it('un élève dont l’inscription est annulée ne figure plus sur la liste', async () => {
      await enable();
      const a = await enrolled('Alpha');
      await sell(secToken, a.studentId, [MON]).expect(201);
      await as(adminToken, http().post(`/enrollments/${a.enrollmentId}/cancel`))
        .send({ motif: 'Départ' })
        .expect(201);
      const res = await daily(cantineToken, MON).expect(200);
      expect(res.body.total).toBe(0);
    });

    it('la liste signale un jour de fermeture', async () => {
      await enable();
      const a = await enrolled('Alpha');
      await sell(secToken, a.studentId, [MON2]).expect(201);
      await as(adminToken, http().post('/calendar-events'))
        .send({
          academicYearId: ids.yearId,
          type: 'AUTRE',
          libelle: 'Grève',
          dateDebut: MON2,
        })
        .expect(201);
      const res = await daily(cantineToken, MON2).expect(200);
      expect(res.body.ferme).toBe('Grève');
    });

    it('rejette une date invalide', async () => {
      await daily(cantineToken, '2026-13-40').expect(400);
    });
  });

  describe('droits', () => {
    it('vendre : secrétariat, comptabilité, Administrateur ; pas la cuisine ni la vie scolaire ni la Direction', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      await sell(cantineToken, studentId, [MON]).expect(403);
      await sell(survToken, studentId, [TUE]).expect(403);
      await sell(directionToken, studentId, [THU]).expect(403);
      await overview(cantineToken, studentId).expect(403);
      await sell(secToken, studentId, [MON]).expect(201);
      await sell(comptaToken, studentId, [TUE]).expect(201);
      await sell(adminToken, studentId, [THU]).expect(201);
      await http()
        .post(`/canteen/students/${studentId}/sales`)
        .send({ dates: [MON2] })
        .expect(401);
    });

    it('lire la liste : Direction, vie scolaire, cuisine, Administrateur ; pas le secrétariat', async () => {
      await daily(directionToken, MON).expect(200);
      await daily(survToken, MON).expect(200);
      await daily(cantineToken, MON).expect(200);
      await daily(adminToken, MON).expect(200);
      await daily(secToken, MON).expect(403);
      await daily(comptaToken, MON).expect(403);
      await http().get(`/canteen/daily?date=${MON}`).expect(401);
    });

    it('le rôle Cantine ne voit rien de financier ni de personnel', async () => {
      for (const path of [
        '/payments/by-student/x',
        '/reports/cash-closing?date=2026-11-02',
        '/reports/insolvent-students',
        '/students',
      ]) {
        const res = await as(cantineToken, http().get(path));
        expect([401, 403, 404]).toContain(res.status);
        expect(res.status).not.toBe(200);
      }
    });
  });

  describe('annulation', () => {
    async function soldAs(token = secToken) {
      await enable();
      const { studentId, enrollmentId } = await enrolled('Mavoungou');
      const sale = await sell(token, studentId, [MON, TUE, THU]).expect(201);
      return { studentId, enrollmentId, sale: sale.body };
    }

    it('annuler le paiement libère les jours et neutralise la ligne', async () => {
      const { studentId, sale } = await soldAs(secToken);
      await as(
        directionToken,
        http().post(`/payments/${sale.paiementId}/cancel`),
      )
        .send({ motif: 'Erreur de saisie' })
        .expect(201);
      expect(await prisma.canteenDay.count()).toBe(0);
      const line = await prisma.invoiceLine.findUniqueOrThrow({
        where: { id: sale.ligneId },
      });
      expect(line.annuleeAt).not.toBeNull();
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: sale.paiementId },
      });
      expect(payment.statut).toBe('ANNULE');
      const log = await prisma.auditLog.findFirst({
        where: { action: 'CANTEEN_RELEASE' },
      });
      expect(JSON.stringify(log!.nouvelleValeur)).toContain(MON);

      // L'élève n'a aucune dette, la ligne annulée ne compte plus nulle part.
      const status = await as(
        adminToken,
        http().get(`/students/${studentId}/financial-status`),
      ).expect(200);
      expect(status.body.montantFacture).toBe(100000);
      expect(
        status.body.lignesEnRetard.map(
          (l: { invoiceLineId: string }) => l.invoiceLineId,
        ),
      ).not.toContain(sale.ligneId);
      const o = await overview(secToken, studentId).expect(200);
      expect(o.body.achats[0].annulee).toBe(true);
      expect(o.body.achats[0].jours).toEqual([]);
      const today = await daily(cantineToken, MON).expect(200);
      expect(today.body.total).toBe(0);
    });

    it('les jours libérés peuvent être revendus, avec un nouveau reçu', async () => {
      const { studentId, sale } = await soldAs(secToken);
      await as(
        directionToken,
        http().post(`/payments/${sale.paiementId}/cancel`),
      )
        .send({ motif: 'Erreur de saisie' })
        .expect(201);
      const again = await sell(secToken, studentId, [MON, TUE]).expect(201);
      expect(again.body.numeroRecu).not.toBe(sale.numeroRecu);
      expect(await prisma.canteenDay.count()).toBe(2);
    });

    it('on ne peut plus encaisser sur la ligne annulée', async () => {
      const { sale } = await soldAs(secToken);
      await as(
        directionToken,
        http().post(`/payments/${sale.paiementId}/cancel`),
      )
        .send({ motif: 'Erreur de saisie' })
        .expect(201);
      const res = await as(adminToken, http().post('/payments')).send({
        invoiceLineId: sale.ligneId,
        montant: 1000,
      });
      expect(res.status).toBe(409);
    });

    it('celui qui a encaissé ne peut pas annuler sa propre vente de cantine', async () => {
      const { sale } = await soldAs(secToken);
      await as(secToken, http().post(`/payments/${sale.paiementId}/cancel`))
        .send({ motif: 'Erreur' })
        .expect(403);
      expect(await prisma.canteenDay.count()).toBe(3);
    });

    it('aucune remise sur une vente de cantine', async () => {
      const { sale } = await soldAs(secToken);
      const res = await as(secToken, http().post('/discounts')).send({
        invoiceLineId: sale.ligneId,
        type: 'MONTANT_FIXE',
        valeur: 500,
        motif: 'Fratrie',
      });
      expect(res.status).toBe(409);
      expect(await prisma.discount.count()).toBe(0);
    });
  });

  describe('autres écrans financiers', () => {
    it('la ligne annulée disparaît du tableau de bord', async () => {
      await enable();
      const { studentId } = await enrolled('Mavoungou');
      const dash = async () =>
        (await as(adminToken, http().get('/reports/dashboard')).expect(200))
          .body.financier;
      const base = await dash();
      const sale = await sell(secToken, studentId, [MON, TUE]).expect(201);
      const withSale = await dash();
      expect(withSale.totalFacture).toBe(base.totalFacture + 2000);
      expect(withSale.totalEncaisse).toBe(base.totalEncaisse + 2000);
      await as(
        directionToken,
        http().post(`/payments/${sale.body.paiementId}/cancel`),
      )
        .send({ motif: 'Erreur' })
        .expect(201);
      const after = await dash();
      expect(after.totalFacture).toBe(base.totalFacture);
      expect(after.totalRestantDu).toBe(base.totalRestantDu);
    });
  });

  describe('portail des parents', () => {
    async function parentToken(studentId: string) {
      const link = await prisma.studentGuardian.findFirstOrThrow({
        where: { studentId },
        include: { guardian: true },
      });
      const code = await as(
        secToken,
        http().post(
          `/parent-accounts/guardians/${link.guardianId}/activation-code`,
        ),
      ).send({});
      const res = await http().post('/portal/activate').send({
        telephone: link.guardian.telephone,
        code: code.body.code,
        motDePasse: 'MotDePasse123',
        consentement: true,
        versionPolitique: '2026-09-v10',
      });
      expect(res.status).toBe(201);
      return res.body.accessToken as string;
    }

    it('le parent voit les jours payés de son enfant, jamais ceux d’une autre famille', async () => {
      await enable();
      const mine = await enrolled('Mavoungou');
      const other = await enrolled('Autre');
      await sell(secToken, mine.studentId, [MON, TUE]).expect(201);
      await sell(secToken, other.studentId, [THU]).expect(201);
      const token = await parentToken(mine.studentId);

      const res = await as(
        token,
        http().get(`/portal/children/${mine.studentId}/canteen`),
      ).expect(200);
      expect(res.body.actif).toBe(true);
      expect(res.body.prixJour).toBe(1000);
      expect(res.body.joursPayes.map((j: any) => j.date)).toEqual([MON, TUE]);
      expect(res.body.achats).toHaveLength(1);
      expect(res.body.achats[0].nombreJours).toBe(2);
      // Aucun identifiant interne, aucun numéro de reçu, aucun nom d'autre enfant.
      expect(JSON.stringify(res.body)).not.toMatch(
        /invoiceLine|ligneId|numeroRecu|Autre/,
      );

      await as(
        token,
        http().get(`/portal/children/${other.studentId}/canteen`),
      ).expect(404);
      // Un jeton du personnel n'ouvre pas la route du portail.
      await as(
        secToken,
        http().get(`/portal/children/${mine.studentId}/canteen`),
      ).expect(401);
    });

    it('cantine éteinte : le parent voit qu’elle n’est pas active', async () => {
      const mine = await enrolled('Mavoungou');
      const token = await parentToken(mine.studentId);
      const res = await as(
        token,
        http().get(`/portal/children/${mine.studentId}/canteen`),
      ).expect(200);
      expect(res.body.actif).toBe(false);
      expect(res.body.joursPayes).toEqual([]);
    });
  });

  describe('migration des droits', () => {
    it('rejouer le SQL des droits est idempotent et donne les bons rôles', async () => {
      const sql = readFileSync(
        join(
          __dirname,
          '../prisma/migrations/20261030080000_cantine/migration.sql',
        ),
        'utf-8',
      );
      const grants = sql.slice(sql.indexOf('-- Droits de la cantine.'));
      await prisma.rolePermission.deleteMany({
        where: {
          permission: { code: { in: ['CANTEEN_SELL', 'CANTEEN_READ'] } },
        },
      });
      const statements = grants
        .split(/;\s*[\r\n]+/)
        .map((st) =>
          st
            .split(/[\r\n]+/)
            .filter((l) => !l.trim().startsWith('--'))
            .join(' ')
            .trim(),
        )
        .filter(Boolean);
      for (let pass = 0; pass < 2; pass += 1) {
        for (const st of statements) await prisma.$executeRawUnsafe(st);
      }

      const holders = async (code: string) =>
        (
          await prisma.role.findMany({
            where: { rolePermissions: { some: { permission: { code } } } },
            select: { code: true },
          })
        )
          .map((r) => r.code)
          .sort();
      expect(await holders('CANTEEN_SELL')).toEqual([
        'ADMINISTRATEUR',
        'COMPTABLE',
        'SECRETAIRE_CAISSIER',
      ]);
      expect(await holders('CANTEEN_READ')).toEqual([
        'ADMINISTRATEUR',
        'CANTINE',
        'DIRECTION',
        'SURVEILLANT',
      ]);
      const role = await prisma.role.findUniqueOrThrow({
        where: { code: 'CANTINE' },
        include: { rolePermissions: { include: { permission: true } } },
      });
      expect(role.rolePermissions.map((r) => r.permission.code)).toEqual([
        'CANTEEN_READ',
      ]);
    });
  });
});

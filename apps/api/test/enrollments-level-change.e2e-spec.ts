import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

jest.setTimeout(30000);

/**
 * Changement de classe d'une inscription, y compris vers un autre niveau (élève rétrogradé ou surclassé par erreur) :
 * la facture se réaligne sur les tarifs du nouveau niveau, les paiements ne bougent jamais.
 */
describe('Changement de classe et de niveau (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let secretaryToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    const school = await prisma.school.findFirstOrThrow();
    await createUserWithRole(prisma, school.id, 'SECRETAIRE_CAISSIER', {
      email: 'secretaire@test.local',
      motDePasse: 'MotDePasse123!',
    });
    adminToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@shakespeareacademy.cg',
          motDePasse: 'ChangeMe123!',
        })
        .expect(201)
    ).body.accessToken;
    secretaryToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'secretaire@test.local', motDePasse: 'MotDePasse123!' })
        .expect(201)
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const admin = (req: request.Test) =>
    req.set('Authorization', `Bearer ${adminToken}`);
  const secretary = (req: request.Test) =>
    req.set('Authorization', `Bearer ${secretaryToken}`);

  interface Fixture {
    yearId: string;
    tps: { levelId: string; classId: string };
    cp: { levelId: string; classId: string; classBId: string };
    pensionId: string;
    inscriptionId: string;
  }

  async function createLevel(
    sectionId: string,
    cycleCode: string,
    levelCode: string,
    yearId: string,
    classNames: string[],
  ) {
    const cycle = await admin(
      request(app.getHttpServer()).post('/cycles'),
    ).send({ sectionId, code: cycleCode, nom: cycleCode });
    const level = await admin(
      request(app.getHttpServer()).post('/levels'),
    ).send({ cycleId: cycle.body.id, code: levelCode, nom: levelCode });
    const classIds: string[] = [];
    for (const nom of classNames) {
      const klass = await admin(
        request(app.getHttpServer()).post('/classes'),
      ).send({ levelId: level.body.id, academicYearId: yearId, nom });
      classIds.push(klass.body.id);
    }
    return { levelId: level.body.id as string, classIds };
  }

  async function schedule(
    yearId: string,
    levelId: string,
    feeTypeId: string,
    body: Record<string, unknown>,
  ) {
    await admin(request(app.getHttpServer()).post('/fee-schedules'))
      .send({ academicYearId: yearId, levelId, feeTypeId, ...body })
      .expect(201);
  }

  const tranches = (montant: number) =>
    [1, 2, 3].map((ordre) => ({
      libelle: `${ordre}e tranche`,
      montant,
      ordre,
      dateLimite: ['2026-10-01', '2027-01-15', '2027-04-01'][ordre - 1],
      delaiGraceJours: 0,
    }));

  /** TPS (maternelle, pension 110 000) et CP (primaire, pension 100 000), même frais d'inscription de 60 000. */
  async function setup(): Promise<Fixture> {
    const section = await admin(
      request(app.getHttpServer()).post('/sections'),
    ).send({ code: 'FR', nom: 'Francophone' });
    const year = await admin(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-07-15',
    });
    const tps = await createLevel(
      section.body.id,
      'MATERNELLE',
      'TPS',
      year.body.id,
      ['TPS'],
    );
    const cp = await createLevel(
      section.body.id,
      'PRIMAIRE',
      'CP',
      year.body.id,
      ['CP A', 'CP B'],
    );
    const inscription = await admin(
      request(app.getHttpServer()).post('/fee-types'),
    ).send({
      code: 'INSCRIPTION',
      nom: 'Frais d’inscription',
      obligatoire: true,
      avecTranches: false,
      appliesTo: 'INSCRIPTION',
    });
    const pension = await admin(
      request(app.getHttpServer()).post('/fee-types'),
    ).send({
      code: 'PENSION',
      nom: 'Pension',
      obligatoire: true,
      avecTranches: true,
    });
    for (const levelId of [tps.levelId, cp.levelId]) {
      await schedule(year.body.id, levelId, inscription.body.id, {
        montant: 60000,
      });
    }
    await schedule(year.body.id, tps.levelId, pension.body.id, {
      installments: tranches(110000),
    });
    await schedule(year.body.id, cp.levelId, pension.body.id, {
      installments: tranches(100000),
    });
    return {
      yearId: year.body.id,
      tps: { levelId: tps.levelId, classId: tps.classIds[0] },
      cp: {
        levelId: cp.levelId,
        classId: cp.classIds[0],
        classBId: cp.classIds[1],
      },
      pensionId: pension.body.id,
      inscriptionId: inscription.body.id,
    };
  }

  async function enrollInTps(fx: Fixture) {
    const student = await admin(
      request(app.getHttpServer()).post('/students'),
    ).send({
      nom: 'Moukala',
      prenom: 'Grace',
      sexe: 'F',
      dateNaissance: '2022-04-12',
      responsable: {
        nom: 'Moukala',
        prenom: 'Jean',
        telephone: '242060000001',
        lien: 'Père',
      },
    });
    const enrollment = await admin(
      request(app.getHttpServer()).post('/enrollments'),
    ).send({
      studentId: student.body.id,
      classId: fx.tps.classId,
      academicYearId: fx.yearId,
    });
    expect(enrollment.status).toBe(201);
    return { student: student.body, enrollment: enrollment.body };
  }

  async function invoiceOf(enrollmentId: string) {
    const res = await admin(
      request(app.getHttpServer()).get(
        `/invoices/by-enrollment/${enrollmentId}`,
      ),
    );
    return res.body as {
      lines: {
        id: string;
        libelle: string;
        montant: number;
        ordre: number;
      }[];
    };
  }

  const total = (lines: { montant: number }[]) =>
    lines.reduce((sum, l) => sum + l.montant, 0);

  const changeClass = (
    who: (r: request.Test) => request.Test,
    enrollmentId: string,
    body: Record<string, unknown>,
  ) =>
    who(
      request(app.getHttpServer()).post(
        `/enrollments/${enrollmentId}/change-class`,
      ),
    ).send(body);

  it('dans le même niveau, la classe change sans toucher à la facture ni exiger de motif', async () => {
    const fx = await setup();
    const { enrollment } = await enrollInTps(fx);
    const moved = await changeClass(admin, enrollment.id, {
      classId: fx.tps.classId,
    });
    expect(moved.status).toBe(409);

    // CP A -> CP B : deux classes du même niveau.
    const toCp = await changeClass(admin, enrollment.id, {
      classId: fx.cp.classId,
      motif: 'Élève admis en CP',
    });
    expect(toCp.status).toBe(201);
    const sameLevel = await changeClass(secretary, enrollment.id, {
      classId: fx.cp.classBId,
    });
    expect(sameLevel.status).toBe(201);
    expect(sameLevel.body.class.id).toBe(fx.cp.classBId);
    expect(sameLevel.body.facture).toBeNull();
    const audit = await prisma.auditLog.findMany({
      where: { entiteId: enrollment.id, action: 'ENROLLMENT_CLASS_UPDATE' },
    });
    expect(audit).toHaveLength(1);
  });

  it('simuler montre l’effet sur la facture sans rien changer', async () => {
    const fx = await setup();
    const { enrollment } = await enrollInTps(fx);
    const before = await invoiceOf(enrollment.id);
    expect(total(before.lines)).toBe(390000);

    const sim = await changeClass(admin, enrollment.id, {
      classId: fx.cp.classId,
      simuler: true,
    });
    expect(sim.status).toBe(201);
    expect(sim.body).toMatchObject({
      simulation: true,
      niveauChange: true,
      ancienneClasse: 'TPS',
      nouvelleClasse: 'CP A',
      droitTarifsRequis: true,
      droitTarifsManquant: false,
      notesDansAncienneClasse: 0,
      appelsDansAncienneClasse: 0,
    });
    expect(sim.body.facture).toMatchObject({
      totalAvant: 390000,
      totalApres: 360000,
      impactFinancier: true,
      inchangees: 1,
      blocages: [],
    });
    expect(sim.body.facture.modifiees).toHaveLength(3);

    const after = await prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(after.classId).toBe(fx.tps.classId);
    expect(total((await invoiceOf(enrollment.id)).lines)).toBe(390000);
  });

  it('un niveau différent réaligne la facture sur les tarifs du nouveau niveau, dans la même inscription', async () => {
    const fx = await setup();
    const { enrollment } = await enrollInTps(fx);

    const res = await changeClass(admin, enrollment.id, {
      classId: fx.cp.classId,
      motif: 'Élève admis en CP, saisi par erreur en TPS',
    });
    expect(res.status).toBe(201);
    expect(res.body.class.id).toBe(fx.cp.classId);
    expect(res.body.id).toBe(enrollment.id);
    expect(res.body.numero).toBe(enrollment.numero);
    expect(res.body.type).toBe(enrollment.type);

    const invoice = await invoiceOf(enrollment.id);
    expect(invoice.lines).toHaveLength(4);
    expect(total(invoice.lines)).toBe(360000);
    expect(
      invoice.lines
        .filter((l) => l.libelle.startsWith('Pension'))
        .map((l) => l.montant),
    ).toEqual([100000, 100000, 100000]);

    const level = await prisma.auditLog.findMany({
      where: { entiteId: enrollment.id, action: 'ENROLLMENT_LEVEL_CHANGE' },
    });
    expect(level).toHaveLength(1);
    expect(JSON.stringify(level[0].nouvelleValeur)).toContain('Élève admis');
    const corrections = await prisma.auditLog.findMany({
      where: { action: 'INVOICE_LINE_CORRECT' },
    });
    expect(corrections).toHaveLength(3);
  });

  it('exige un motif pour un changement de niveau (400), sans rien modifier', async () => {
    const fx = await setup();
    const { enrollment } = await enrollInTps(fx);
    const res = await changeClass(admin, enrollment.id, {
      classId: fx.cp.classId,
    });
    expect(res.status).toBe(400);
    const row = await prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(row.classId).toBe(fx.tps.classId);
  });

  it('sans le droit de gérer les tarifs, refuse un changement qui modifie la facture (403) et ne change rien', async () => {
    const fx = await setup();
    const { enrollment } = await enrollInTps(fx);
    const sim = await changeClass(secretary, enrollment.id, {
      classId: fx.cp.classId,
      simuler: true,
    });
    expect(sim.body.droitTarifsManquant).toBe(true);

    const res = await changeClass(secretary, enrollment.id, {
      classId: fx.cp.classId,
      motif: 'Erreur de classe',
    });
    expect(res.status).toBe(403);
    const row = await prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(row.classId).toBe(fx.tps.classId);
    expect(total((await invoiceOf(enrollment.id)).lines)).toBe(390000);
  });

  it('sans le droit des tarifs, un changement de niveau qui laisse la facture identique reste permis', async () => {
    const fx = await setup();
    // Même pension dans les deux niveaux : le changement n'a aucun effet financier.
    await prisma.installmentSchedule.updateMany({
      where: { feeSchedule: { levelId: fx.cp.levelId } },
      data: { montant: 110000 },
    });
    const { enrollment } = await enrollInTps(fx);
    const res = await changeClass(secretary, enrollment.id, {
      classId: fx.cp.classId,
      motif: 'Erreur de classe',
    });
    expect(res.status).toBe(201);
    expect(res.body.class.id).toBe(fx.cp.classId);
    expect(total((await invoiceOf(enrollment.id)).lines)).toBe(390000);
  });

  it('garde les paiements déjà encaissés et la ligne qui les porte', async () => {
    const fx = await setup();
    const { enrollment } = await enrollInTps(fx);
    const before = await invoiceOf(enrollment.id);
    const tranche1 = before.lines.find((l) => l.ordre === 1)!;
    const paid = await admin(
      request(app.getHttpServer()).post('/payments'),
    ).send({ invoiceLineId: tranche1.id, montant: 50000 });
    expect(paid.status).toBe(201);

    const res = await changeClass(admin, enrollment.id, {
      classId: fx.cp.classId,
      motif: 'Élève admis en CP',
    });
    expect(res.status).toBe(201);

    const after = await invoiceOf(enrollment.id);
    const same = after.lines.find((l) => l.id === tranche1.id)!;
    expect(same.montant).toBe(100000);
    const payments = await prisma.payment.findMany({
      where: { invoiceLineId: tranche1.id },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ montant: 50000, statut: 'VALIDE' });
    expect(payments[0].numeroRecu).toBe(paid.body.numeroRecu);
  });

  it('refuse (409) quand ce qui est déjà payé dépasserait le nouveau tarif (RG08), sans rien changer', async () => {
    const fx = await setup();
    const { enrollment } = await enrollInTps(fx);
    const tranche1 = (await invoiceOf(enrollment.id)).lines.find(
      (l) => l.ordre === 1 && l.libelle.startsWith('Pension'),
    )!;
    await admin(request(app.getHttpServer()).post('/payments'))
      .send({ invoiceLineId: tranche1.id, montant: 110000 })
      .expect(201);

    const sim = await changeClass(admin, enrollment.id, {
      classId: fx.cp.classId,
      simuler: true,
    });
    expect(sim.body.facture.blocages).toHaveLength(1);

    const res = await changeClass(admin, enrollment.id, {
      classId: fx.cp.classId,
      motif: 'Élève admis en CP',
    });
    expect(res.status).toBe(409);
    const row = await prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(row.classId).toBe(fx.tps.classId);
    expect(total((await invoiceOf(enrollment.id)).lines)).toBe(390000);
  });

  it('refuse (409) tant qu’un paiement en ligne est en cours sur une ligne dont le montant change', async () => {
    const fx = await setup();
    const { enrollment } = await enrollInTps(fx);
    const tranche1 = (await invoiceOf(enrollment.id)).lines.find(
      (l) => l.ordre === 1 && l.libelle.startsWith('Pension'),
    )!;
    const school = await prisma.school.findFirstOrThrow();
    const guardian = await prisma.guardian.findFirstOrThrow();
    await prisma.onlinePayment.create({
      data: {
        schoolId: school.id,
        invoiceLineId: tranche1.id,
        guardianId: guardian.id,
        montant: 20000,
        telephone: '242060000001',
        depositId: 'dep-en-cours',
        statut: 'EN_ATTENTE',
      },
    });
    const res = await changeClass(admin, enrollment.id, {
      classId: fx.cp.classId,
      motif: 'Élève admis en CP',
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('paiement est en cours');
    const row = await prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(row.classId).toBe(fx.tps.classId);
  });

  it('ne touche pas aux lignes ajoutées à la main', async () => {
    const fx = await setup();
    const { enrollment } = await enrollInTps(fx);
    const tenue = await admin(
      request(app.getHttpServer()).post('/fee-types'),
    ).send({
      code: 'TENUE',
      nom: 'Tenue',
      obligatoire: false,
      avecTranches: false,
    });
    const invoice = await invoiceOf(enrollment.id);
    await admin(
      request(app.getHttpServer()).post(
        `/invoices/${(invoice as unknown as { id: string }).id}/lines`,
      ),
    )
      .send({ feeTypeId: tenue.body.id, montant: 15000 })
      .expect(201);

    const sim = await changeClass(admin, enrollment.id, {
      classId: fx.cp.classId,
      simuler: true,
    });
    expect(sim.body.facture.nonConcernees).toEqual(['Tenue']);

    await changeClass(admin, enrollment.id, {
      classId: fx.cp.classId,
      motif: 'Élève admis en CP',
    }).expect(201);
    const after = await invoiceOf(enrollment.id);
    expect(after.lines.find((l) => l.libelle === 'Tenue')?.montant).toBe(15000);
    expect(total(after.lines)).toBe(375000);
  });

  it('ajoute les lignes que le nouveau niveau prévoit en plus', async () => {
    const fx = await setup();
    const { enrollment } = await enrollInTps(fx);
    await admin(request(app.getHttpServer()).post('/fee-schedules'))
      .send({
        academicYearId: fx.yearId,
        levelId: fx.cp.levelId,
        feeTypeId: (
          await admin(request(app.getHttpServer()).post('/fee-types')).send({
            code: 'ASSURANCE',
            nom: 'Assurance',
            obligatoire: true,
            avecTranches: false,
          })
        ).body.id,
        montant: 5000,
      })
      .expect(201);
    await changeClass(admin, enrollment.id, {
      classId: fx.cp.classId,
      motif: 'Élève admis en CP',
    }).expect(201);
    const lines = (await invoiceOf(enrollment.id)).lines;
    expect(lines.find((l) => l.libelle === 'Assurance')?.montant).toBe(5000);
    expect(total(lines)).toBe(365000);
  });

  it('refuse une classe d’une autre année, une inscription annulée, et deux corrections simultanées ne passent qu’une fois', async () => {
    const fx = await setup();
    const { enrollment } = await enrollInTps(fx);
    const otherYear = await admin(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2027-2028',
      dateDebut: '2027-09-01',
      dateFin: '2028-07-15',
    });
    const futureClass = await admin(
      request(app.getHttpServer()).post('/classes'),
    ).send({
      levelId: fx.cp.levelId,
      academicYearId: otherYear.body.id,
      nom: 'CP 2028',
    });
    await changeClass(admin, enrollment.id, {
      classId: futureClass.body.id,
      motif: 'x y z',
    }).expect(400);

    const [a, b] = await Promise.all([
      changeClass(admin, enrollment.id, {
        classId: fx.cp.classId,
        motif: 'Élève admis en CP',
      }),
      changeClass(admin, enrollment.id, {
        classId: fx.cp.classBId,
        motif: 'Élève admis en CP',
      }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);

    await admin(
      request(app.getHttpServer()).post(`/enrollments/${enrollment.id}/cancel`),
    )
      .send({ motif: 'Erreur de saisie' })
      .expect(201);
    await changeClass(admin, enrollment.id, {
      classId: fx.tps.classId,
      motif: 'Élève admis en CP',
    }).expect(409);
  });
});

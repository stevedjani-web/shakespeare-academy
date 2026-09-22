import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

describe('Tarifs, factures, remises, solvabilité (e2e)', () => {
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
    await seedBaseFixtures(prisma);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@shakespeareacademy.cg',
        motDePasse: 'ChangeMe123!',
      })
      .expect(201);
    adminToken = login.body.accessToken;

    // D19 (DECISIONS_PENDING.md) : l'approbation des remises est réservée à Direction, jamais
    // Administrateur — un compte Direction dédié est donc nécessaire pour ces actions.
    // Créé en base : l'Administrateur n'a plus le droit de créer un compte Direction (droits réservés).
    const school = await prisma.school.findFirstOrThrow();
    await createUserWithRole(prisma, school.id, 'DIRECTION', {
      nom: 'Direction',
      prenom: 'Test',
      email: 'direction@shakespeareacademy.cg',
      motDePasse: 'MotDePasse123!',
    });
    const directionLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'direction@shakespeareacademy.cg',
        motDePasse: 'MotDePasse123!',
      })
      .expect(201);
    directionToken = directionLogin.body.accessToken;
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

  async function createClassInYear(yearLibelle: string) {
    const section = await auth(
      request(app.getHttpServer()).post('/sections'),
    ).send({
      code: `SEC_${yearLibelle.replace(/-/g, '_')}`,
      nom: 'Section francophone',
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
      libelle: yearLibelle,
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
    return { year: year.body, class: klass.body, level: level.body };
  }

  async function createStudent() {
    const res = await auth(request(app.getHttpServer()).post('/students')).send(
      {
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
      },
    );
    return res.body;
  }

  async function createFeeType(overrides: Record<string, unknown> = {}) {
    const res = await auth(
      request(app.getHttpServer()).post('/fee-types'),
    ).send({
      code: 'FRAIS_INSCRIPTION',
      nom: "Frais d'inscription",
      obligatoire: true,
      avecTranches: false,
      ...overrides,
    });
    return res.body;
  }

  describe('FeeTypes / FeeSchedules', () => {
    it('crée un type de frais et refuse un code dupliqué (409)', async () => {
      const feeType = await createFeeType();
      expect(feeType.code).toBe('FRAIS_INSCRIPTION');

      await auth(request(app.getHttpServer()).post('/fee-types'))
        .send({ code: 'FRAIS_INSCRIPTION', nom: 'Doublon' })
        .expect(409);
    });

    it('crée une grille tarifaire à montant unique et refuse un doublon (académie année+niveau+type)', async () => {
      const { year, level } = await createClassInYear('2026-2027');
      const feeType = await createFeeType();

      const res = await auth(
        request(app.getHttpServer()).post('/fee-schedules'),
      ).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        montant: 25000,
      });
      expect(res.status).toBe(201);
      expect(res.body.montant).toBe(25000);

      await auth(request(app.getHttpServer()).post('/fee-schedules'))
        .send({
          academicYearId: year.id,
          levelId: level.id,
          feeTypeId: feeType.id,
          montant: 30000,
        })
        .expect(409);
    });

    it('refuse un montant sans tranches pour un type de frais avecTranches=true (400)', async () => {
      const { year, level } = await createClassInYear('2026-2027');
      const feeType = await createFeeType({
        code: 'ECOLAGE',
        nom: 'Écolage',
        avecTranches: true,
      });

      await auth(request(app.getHttpServer()).post('/fee-schedules'))
        .send({
          academicYearId: year.id,
          levelId: level.id,
          feeTypeId: feeType.id,
          montant: 90000,
        })
        .expect(400);
    });

    it('crée une grille avec 3 tranches pour un type de frais avecTranches=true', async () => {
      const { year, level } = await createClassInYear('2026-2027');
      const feeType = await createFeeType({
        code: 'ECOLAGE',
        nom: 'Écolage',
        avecTranches: true,
      });

      const res = await auth(
        request(app.getHttpServer()).post('/fee-schedules'),
      ).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        installments: [
          {
            libelle: '1ère tranche',
            montant: 30000,
            ordre: 1,
            dateLimite: '2026-10-01',
            delaiGraceJours: 0,
          },
          {
            libelle: '2ème tranche',
            montant: 30000,
            ordre: 2,
            dateLimite: '2027-01-15',
            delaiGraceJours: 5,
          },
          {
            libelle: '3ème tranche',
            montant: 30000,
            ordre: 3,
            dateLimite: '2027-04-01',
            delaiGraceJours: 5,
          },
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body.installments).toHaveLength(3);
    });

    it('refuse la gestion des tarifs sans FEE_MANAGE (403)', async () => {
      // Un compte Secrétaire-caissier n'a pas FEE_MANAGE (cahier §3).
      const roles = await auth(request(app.getHttpServer()).get('/roles'));
      const secretaireRole = roles.body.find(
        (r: { code: string }) => r.code === 'SECRETAIRE_CAISSIER',
      );
      const created = await auth(
        request(app.getHttpServer()).post('/users'),
      ).send({
        nom: 'Caissier',
        prenom: 'Test',
        email: 'caissier@shakespeareacademy.cg',
        motDePasse: 'MotDePasse123!',
        roleId: secretaireRole.id,
      });
      expect(created.status).toBe(201);
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'caissier@shakespeareacademy.cg',
          motDePasse: 'MotDePasse123!',
        });
      const caissierToken = login.body.accessToken;

      await request(app.getHttpServer())
        .post('/fee-types')
        .set('Authorization', `Bearer ${caissierToken}`)
        .send({ code: 'X', nom: 'X' })
        .expect(403);
    });
  });

  describe('Génération automatique de facture à l’inscription', () => {
    it('une inscription génère une facture avec les lignes des frais obligatoires (montant unique)', async () => {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeType = await createFeeType();
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        montant: 25000,
      });
      const student = await createStudent();

      const enrollment = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });
      expect(enrollment.status).toBe(201);

      const invoice = await auth(
        request(app.getHttpServer()).get(
          `/invoices/by-enrollment/${enrollment.body.id}`,
        ),
      );
      expect(invoice.status).toBe(200);
      expect(invoice.body.statut).toBe('EMISE');
      expect(invoice.body.lines).toHaveLength(1);
      expect(invoice.body.lines[0].montant).toBe(25000);
    });

    it('une inscription génère une ligne par tranche pour un frais avecTranches=true', async () => {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeType = await createFeeType({
        code: 'ECOLAGE',
        nom: 'Écolage',
        avecTranches: true,
      });
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        installments: [
          {
            libelle: '1ère tranche',
            montant: 30000,
            ordre: 1,
            dateLimite: '2026-10-01',
            delaiGraceJours: 0,
          },
          {
            libelle: '2ème tranche',
            montant: 30000,
            ordre: 2,
            dateLimite: '2027-01-15',
            delaiGraceJours: 5,
          },
          {
            libelle: '3ème tranche',
            montant: 30000,
            ordre: 3,
            dateLimite: '2027-04-01',
            delaiGraceJours: 5,
          },
        ],
      });
      const student = await createStudent();

      const enrollment = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });

      const invoice = await auth(
        request(app.getHttpServer()).get(
          `/invoices/by-enrollment/${enrollment.body.id}`,
        ),
      );
      expect(invoice.body.lines).toHaveLength(3);
      expect(
        invoice.body.lines.reduce(
          (s: number, l: { montant: number }) => s + l.montant,
          0,
        ),
      ).toBe(90000);
    });

    it('D39 : un frais appliesTo=INSCRIPTION n’est jamais facturé à une réinscription, et vice versa', async () => {
      const y1 = await createClassInYear('2025-2026');
      const y2 = await createClassInYear('2026-2027');
      const feeInscription = await createFeeType({
        code: 'FRAIS_INSCRIPTION',
        nom: "Frais d'inscription",
        appliesTo: 'INSCRIPTION',
      });
      const feeReinscription = await createFeeType({
        code: 'FRAIS_REINSCRIPTION',
        nom: 'Frais de réinscription',
        appliesTo: 'REINSCRIPTION',
      });
      for (const { level, year } of [y1, y2]) {
        await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
          academicYearId: year.id,
          levelId: level.id,
          feeTypeId: feeInscription.id,
          montant: 45000,
        });
        await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
          academicYearId: year.id,
          levelId: level.id,
          feeTypeId: feeReinscription.id,
          montant: 60000,
        });
      }
      const student = await createStudent();

      const enrollment1 = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: y1.class.id,
        academicYearId: y1.year.id,
      });
      expect(enrollment1.body.type).toBe('INSCRIPTION');
      const invoice1 = await auth(
        request(app.getHttpServer()).get(
          `/invoices/by-enrollment/${enrollment1.body.id}`,
        ),
      );
      expect(invoice1.body.lines).toHaveLength(1);
      expect(invoice1.body.lines[0].montant).toBe(45000);

      const enrollment2 = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: y2.class.id,
        academicYearId: y2.year.id,
      });
      expect(enrollment2.body.type).toBe('REINSCRIPTION');
      const invoice2 = await auth(
        request(app.getHttpServer()).get(
          `/invoices/by-enrollment/${enrollment2.body.id}`,
        ),
      );
      expect(invoice2.body.lines).toHaveLength(1);
      expect(invoice2.body.lines[0].montant).toBe(60000);
    });

    it('un frais facultatif (obligatoire=false) n’est jamais facturé automatiquement', async () => {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeType = await createFeeType({
        code: 'CANTINE',
        nom: 'Cantine',
        obligatoire: false,
      });
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        montant: 15000,
      });
      const student = await createStudent();

      const enrollment = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });

      const invoice = await auth(
        request(app.getHttpServer()).get(
          `/invoices/by-enrollment/${enrollment.body.id}`,
        ),
      );
      expect(invoice.body.lines).toHaveLength(0);
    });

    it('annuler une inscription annule sa facture', async () => {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeType = await createFeeType();
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        montant: 25000,
      });
      const student = await createStudent();
      const enrollment = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });

      await auth(
        request(app.getHttpServer()).post(
          `/enrollments/${enrollment.body.id}/cancel`,
        ),
      ).send({
        motif: 'Erreur de saisie',
      });

      const invoice = await auth(
        request(app.getHttpServer()).get(
          `/invoices/by-enrollment/${enrollment.body.id}`,
        ),
      );
      expect(invoice.body.statut).toBe('ANNULEE');
    });
  });

  describe('Autres frais (ajout manuel de ligne)', () => {
    it('ajoute une ligne pour un type de frais facultatif (tenue, cantine...)', async () => {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeTypeInscription = await createFeeType();
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeTypeInscription.id,
        montant: 25000,
      });
      const feeTenue = await createFeeType({
        code: 'TENUE',
        nom: 'Tenue scolaire',
        obligatoire: false,
      });
      const student = await createStudent();
      const enrollment = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });
      const invoice = await auth(
        request(app.getHttpServer()).get(
          `/invoices/by-enrollment/${enrollment.body.id}`,
        ),
      );
      expect(invoice.body.lines).toHaveLength(1);

      const added = await auth(
        request(app.getHttpServer()).post(`/invoices/${invoice.body.id}/lines`),
      ).send({ feeTypeId: feeTenue.id, montant: 15000 });
      expect(added.status).toBe(201);
      expect(added.body.lines).toHaveLength(2);
      expect(
        added.body.lines.map((l: { montant: number }) => l.montant).sort(),
      ).toEqual([15000, 25000]);
    });

    it('refuse d’ajouter une ligne sur une facture annulée (409)', async () => {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeType = await createFeeType();
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        montant: 25000,
      });
      const feeCantine = await createFeeType({
        code: 'CANTINE',
        nom: 'Cantine',
        obligatoire: false,
      });
      const student = await createStudent();
      const enrollment = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });
      const invoice = await auth(
        request(app.getHttpServer()).get(
          `/invoices/by-enrollment/${enrollment.body.id}`,
        ),
      );
      await auth(
        request(app.getHttpServer()).post(
          `/enrollments/${enrollment.body.id}/cancel`,
        ),
      ).send({
        motif: 'Test',
      });

      await auth(
        request(app.getHttpServer()).post(`/invoices/${invoice.body.id}/lines`),
      )
        .send({ feeTypeId: feeCantine.id, montant: 10000 })
        .expect(409);
    });

    it('refuse d’ajouter une ligne pour un type de frais avecTranches (400)', async () => {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeType = await createFeeType();
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        montant: 25000,
      });
      const feeTranches = await createFeeType({
        code: 'ECOLAGE2',
        nom: 'Écolage',
        avecTranches: true,
      });
      const student = await createStudent();
      const enrollment = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });
      const invoice = await auth(
        request(app.getHttpServer()).get(
          `/invoices/by-enrollment/${enrollment.body.id}`,
        ),
      );

      await auth(
        request(app.getHttpServer()).post(`/invoices/${invoice.body.id}/lines`),
      )
        .send({ feeTypeId: feeTranches.id, montant: 10000 })
        .expect(400);
    });
  });

  describe('Remises (Discount)', () => {
    async function setupInvoiceLine() {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeType = await createFeeType();
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        montant: 25000,
      });
      const student = await createStudent();
      const enrollment = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });
      const invoice = await auth(
        request(app.getHttpServer()).get(
          `/invoices/by-enrollment/${enrollment.body.id}`,
        ),
      );
      return { invoiceLineId: invoice.body.lines[0].id, studentId: student.id };
    }

    it('crée une remise EN_ATTENTE puis l’approuve (RG06)', async () => {
      const { invoiceLineId } = await setupInvoiceLine();

      const discount = await auth(
        request(app.getHttpServer()).post('/discounts'),
      ).send({
        invoiceLineId,
        type: 'MONTANT_FIXE',
        valeur: 5000,
        motif: 'Fratrie',
      });
      expect(discount.status).toBe(201);
      expect(discount.body.statut).toBe('EN_ATTENTE');

      const approved = await authDir(
        request(app.getHttpServer()).post(
          `/discounts/${discount.body.id}/approve`,
        ),
      );
      expect(approved.status).toBe(201);
      expect(approved.body.statut).toBe('APPROUVEE');
    });

    it('rejette une remise avec motif', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      const discount = await auth(
        request(app.getHttpServer()).post('/discounts'),
      ).send({
        invoiceLineId,
        type: 'POURCENTAGE',
        valeur: 10,
        motif: 'Demande non justifiée',
      });

      const rejected = await authDir(
        request(app.getHttpServer()).post(
          `/discounts/${discount.body.id}/reject`,
        ),
      ).send({ motifRejet: 'Pièce justificative manquante' });
      expect(rejected.status).toBe(201);
      expect(rejected.body.statut).toBe('REJETEE');
    });

    it('refuse d’approuver deux fois la même remise (409)', async () => {
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
      ).expect(201);
      await authDir(
        request(app.getHttpServer()).post(
          `/discounts/${discount.body.id}/approve`,
        ),
      ).expect(409);
    });

    it('refuse à celui qui a demandé une remise de l’approuver lui-même (RG06), même s’il en a le droit', async () => {
      const school = await prisma.school.findFirstOrThrow();
      const role = await prisma.role.create({
        data: {
          code: 'DEMANDE_ET_APPROBATION',
          nom: 'Cumul',
          description: 'test',
        },
      });
      const perms = await prisma.permission.findMany({
        where: {
          code: {
            in: [
              'STUDENT_READ',
              'FINANCE_READ',
              'ENROLLMENT_MANAGE',
              'DISCOUNT_APPROVE',
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
        'DEMANDE_ET_APPROBATION',
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
      const discount = await request(app.getHttpServer())
        .post('/discounts')
        .set('Authorization', `Bearer ${cumulToken}`)
        .send({
          invoiceLineId,
          type: 'MONTANT_FIXE',
          valeur: 5000,
          motif: 'Fratrie',
        })
        .expect(201);

      const self = await request(app.getHttpServer())
        .post(`/discounts/${discount.body.id}/approve`)
        .set('Authorization', `Bearer ${cumulToken}`);
      expect(self.status).toBe(403);
      expect(self.body.message).toMatch(/votre propre demande/);
      expect(
        (
          await prisma.discount.findUniqueOrThrow({
            where: { id: discount.body.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');

      await authDir(
        request(app.getHttpServer()).post(
          `/discounts/${discount.body.id}/approve`,
        ),
      ).expect(201);
    });

    it('refuse à Administrateur d’approuver une remise (403) — D19 : Direction uniquement', async () => {
      const { invoiceLineId } = await setupInvoiceLine();
      const discount = await auth(
        request(app.getHttpServer()).post('/discounts'),
      ).send({
        invoiceLineId,
        type: 'MONTANT_FIXE',
        valeur: 5000,
        motif: 'Fratrie',
      });
      await auth(
        request(app.getHttpServer()).post(
          `/discounts/${discount.body.id}/approve`,
        ),
      ).expect(403);
    });
  });

  describe('Statut de solvabilité (financial-status)', () => {
    it('SOLVABLE quand aucune facture n’existe', async () => {
      const student = await createStudent();
      const status = await auth(
        request(app.getHttpServer()).get(
          `/students/${student.id}/financial-status`,
        ),
      );
      expect(status.status).toBe(200);
      expect(status.body.statut).toBe('SOLVABLE');
      expect(status.body.montantFacture).toBe(0);
    });

    it('EN_RETARD dès qu’un frais immédiatement exigible (sans échéance) n’est pas couvert', async () => {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeType = await createFeeType();
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        montant: 25000,
      });
      const student = await createStudent();
      await auth(request(app.getHttpServer()).post('/enrollments')).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });

      const status = await auth(
        request(app.getHttpServer()).get(
          `/students/${student.id}/financial-status`,
        ),
      );
      expect(status.body.statut).toBe('EN_RETARD');
      expect(status.body.montantFacture).toBe(25000);
      expect(status.body.montantExigible).toBe(25000);
      expect(status.body.montantPaye).toBe(0);
    });

    it('A_ECHOIR pour une échéance future non encore due', async () => {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeType = await createFeeType({
        code: 'ECOLAGE',
        nom: 'Écolage',
        avecTranches: true,
      });
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        installments: [
          {
            libelle: 'Tranche unique',
            montant: 30000,
            ordre: 1,
            dateLimite: futureDate.toISOString(),
            delaiGraceJours: 0,
          },
        ],
      });
      const student = await createStudent();
      await auth(request(app.getHttpServer()).post('/enrollments')).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });

      const status = await auth(
        request(app.getHttpServer()).get(
          `/students/${student.id}/financial-status`,
        ),
      );
      expect(status.body.statut).toBe('A_ECHOIR');
      expect(status.body.montantAEchoir).toBe(30000);
      expect(status.body.montantExigible).toBe(0);
    });

    it('EXONERE quand une remise approuvée couvre 100% du montant facturé', async () => {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeType = await createFeeType();
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        montant: 25000,
      });
      const student = await createStudent();
      const enrollment = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });
      const invoice = await auth(
        request(app.getHttpServer()).get(
          `/invoices/by-enrollment/${enrollment.body.id}`,
        ),
      );
      const discount = await auth(
        request(app.getHttpServer()).post('/discounts'),
      ).send({
        invoiceLineId: invoice.body.lines[0].id,
        type: 'POURCENTAGE',
        valeur: 100,
        motif: 'Exonération direction',
      });
      await authDir(
        request(app.getHttpServer()).post(
          `/discounts/${discount.body.id}/approve`,
        ),
      ).expect(201);

      const status = await auth(
        request(app.getHttpServer()).get(
          `/students/${student.id}/financial-status`,
        ),
      );
      expect(status.body.statut).toBe('EXONERE');
      expect(status.body.montantRestant).toBe(0);
    });

    it('une facture annulée n’entre jamais dans le calcul de solvabilité', async () => {
      const {
        year,
        class: klass,
        level,
      } = await createClassInYear('2026-2027');
      const feeType = await createFeeType();
      await auth(request(app.getHttpServer()).post('/fee-schedules')).send({
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: feeType.id,
        montant: 25000,
      });
      const student = await createStudent();
      const enrollment = await auth(
        request(app.getHttpServer()).post('/enrollments'),
      ).send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      });
      await auth(
        request(app.getHttpServer()).post(
          `/enrollments/${enrollment.body.id}/cancel`,
        ),
      ).send({
        motif: 'Annulation test',
      });

      const status = await auth(
        request(app.getHttpServer()).get(
          `/students/${student.id}/financial-status`,
        ),
      );
      expect(status.body.statut).toBe('SOLVABLE');
      expect(status.body.montantFacture).toBe(0);
    });
  });
});

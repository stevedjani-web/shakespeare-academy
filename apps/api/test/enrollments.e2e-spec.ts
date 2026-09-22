import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures } from './utils/fixtures';

describe('Inscriptions et réinscriptions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${adminToken}`);
  }

  async function createClassInYear(
    yearLibelle: string,
    yearDates: { debut: string; fin: string },
  ) {
    const section = await auth(
      request(app.getHttpServer()).post('/sections'),
    ).send({
      code: `SEC_${yearLibelle.replace(/-/g, '_')}`,
      nom: 'Section francophone',
    });
    expect(section.status).toBe(201);
    const cycle = await auth(request(app.getHttpServer()).post('/cycles')).send(
      {
        sectionId: section.body.id,
        code: 'PRIMAIRE',
        nom: 'Primaire',
      },
    );
    expect(cycle.status).toBe(201);
    const level = await auth(request(app.getHttpServer()).post('/levels')).send(
      {
        cycleId: cycle.body.id,
        code: 'CM2',
        nom: 'CM2',
      },
    );
    expect(level.status).toBe(201);
    const year = await auth(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: yearLibelle,
      dateDebut: yearDates.debut,
      dateFin: yearDates.fin,
    });
    expect(year.status).toBe(201);
    const klass = await auth(
      request(app.getHttpServer()).post('/classes'),
    ).send({
      levelId: level.body.id,
      academicYearId: year.body.id,
      nom: 'CM2 A',
    });
    expect(klass.status).toBe(201);
    return { year: year.body, class: klass.body, level: level.body };
  }

  async function createStudent(overrides: Record<string, unknown> = {}) {
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
        ...overrides,
      },
    );
    return res.body;
  }

  it('première inscription : type INSCRIPTION, numéro au format {année}-{séquence}', async () => {
    const { year, class: klass } = await createClassInYear('2026-2027', {
      debut: '2026-09-01',
      fin: '2027-07-15',
    });
    const student = await createStudent();

    const res = await auth(
      request(app.getHttpServer()).post('/enrollments'),
    ).send({
      studentId: student.id,
      classId: klass.id,
      academicYearId: year.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('INSCRIPTION');
    expect(res.body.numero).toBe('2026-2027-00001');
    expect(res.body.statut).toBe('ACTIVE');
  });

  it('réinscription : un élève déjà inscrit une année précédente devient REINSCRIPTION l’année suivante', async () => {
    const y1 = await createClassInYear('2025-2026', {
      debut: '2025-09-01',
      fin: '2026-07-15',
    });
    const y2 = await createClassInYear('2026-2027', {
      debut: '2026-09-01',
      fin: '2027-07-15',
    });
    const student = await createStudent();

    await auth(request(app.getHttpServer()).post('/enrollments'))
      .send({
        studentId: student.id,
        classId: y1.class.id,
        academicYearId: y1.year.id,
      })
      .expect(201);

    const reinscription = await auth(
      request(app.getHttpServer()).post('/enrollments'),
    ).send({
      studentId: student.id,
      classId: y2.class.id,
      academicYearId: y2.year.id,
    });
    expect(reinscription.body.type).toBe('REINSCRIPTION');
  });

  it('RG01 : refuse une deuxième inscription active du même élève pour la même année', async () => {
    const { year, class: klass } = await createClassInYear('2026-2027', {
      debut: '2026-09-01',
      fin: '2027-07-15',
    });
    const student = await createStudent();

    await auth(request(app.getHttpServer()).post('/enrollments'))
      .send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      })
      .expect(201);

    await auth(request(app.getHttpServer()).post('/enrollments'))
      .send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      })
      .expect(409);
  });

  it('refuse une inscription si la classe n’appartient pas à l’année scolaire indiquée (400)', async () => {
    const y1 = await createClassInYear('2025-2026', {
      debut: '2025-09-01',
      fin: '2026-07-15',
    });
    const y2 = await createClassInYear('2026-2027', {
      debut: '2026-09-01',
      fin: '2027-07-15',
    });
    const student = await createStudent();

    await auth(request(app.getHttpServer()).post('/enrollments'))
      .send({
        studentId: student.id,
        classId: y1.class.id,
        academicYearId: y2.year.id,
      })
      .expect(400);
  });

  it('refuse une inscription dans une année scolaire clôturée', async () => {
    const { year, class: klass } = await createClassInYear('2026-2027', {
      debut: '2026-09-01',
      fin: '2027-07-15',
    });
    const student = await createStudent();
    await auth(
      request(app.getHttpServer()).post(`/academic-years/${year.id}/activate`),
    ).expect(201);
    await auth(
      request(app.getHttpServer()).post(`/academic-years/${year.id}/close`),
    ).expect(201);

    await auth(request(app.getHttpServer()).post('/enrollments'))
      .send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      })
      .expect(409);
  });

  it('annule une inscription active avec motif, journalise, et permet une nouvelle inscription ensuite', async () => {
    const { year, class: klass } = await createClassInYear('2026-2027', {
      debut: '2026-09-01',
      fin: '2027-07-15',
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
    )
      .send({ motif: 'Erreur de saisie, mauvaise classe sélectionnée' })
      .expect(201);

    const cancelled = await auth(
      request(app.getHttpServer()).get(`/enrollments/${enrollment.body.id}`),
    );
    expect(cancelled.body.statut).toBe('ANNULEE');
    expect(cancelled.body.motifAnnulation).toMatch(/mauvaise classe/);

    // Le RG01 ne bloque que les inscriptions ACTIVE : une nouvelle inscription reste possible après annulation.
    await auth(request(app.getHttpServer()).post('/enrollments'))
      .send({
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      })
      .expect(201);

    const logs = await auth(
      request(app.getHttpServer()).get('/audit-logs?entite=Enrollment'),
    );
    const actions = logs.body.map((l: { action: string }) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining(['ENROLLMENT_CREATE', 'ENROLLMENT_CANCEL']),
    );
  });

  it('refuse d’annuler une inscription déjà annulée', async () => {
    const { year, class: klass } = await createClassInYear('2026-2027', {
      debut: '2026-09-01',
      fin: '2027-07-15',
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
      motif: 'Première annulation',
    });
    await auth(
      request(app.getHttpServer()).post(
        `/enrollments/${enrollment.body.id}/cancel`,
      ),
    )
      .send({ motif: 'Deuxième tentative' })
      .expect(409);
  });

  it('filtre les inscriptions par classe et par année', async () => {
    const { year, class: klass } = await createClassInYear('2026-2027', {
      debut: '2026-09-01',
      fin: '2027-07-15',
    });
    const student = await createStudent();
    const enrollment = await auth(
      request(app.getHttpServer()).post('/enrollments'),
    ).send({
      studentId: student.id,
      classId: klass.id,
      academicYearId: year.id,
    });

    const byClass = await auth(
      request(app.getHttpServer()).get(`/enrollments?classId=${klass.id}`),
    );
    expect(byClass.body.map((e: { id: string }) => e.id)).toEqual([
      enrollment.body.id,
    ]);

    const byStudent = await auth(
      request(app.getHttpServer()).get(`/students?classId=${klass.id}`),
    );
    expect(byStudent.body.map((s: { id: string }) => s.id)).toEqual([
      student.id,
    ]);
  });

  it('corrige la classe d’une inscription active (même niveau, même année)', async () => {
    const {
      year,
      class: klassA,
      level,
    } = await createClassInYear('2026-2027', {
      debut: '2026-09-01',
      fin: '2027-07-15',
    });
    const klassB = await auth(
      request(app.getHttpServer()).post('/classes'),
    ).send({
      levelId: level.id,
      academicYearId: year.id,
      nom: 'CM2 B',
    });
    const student = await createStudent();
    const enrollment = await auth(
      request(app.getHttpServer()).post('/enrollments'),
    ).send({
      studentId: student.id,
      classId: klassA.id,
      academicYearId: year.id,
    });

    const changed = await auth(
      request(app.getHttpServer()).post(
        `/enrollments/${enrollment.body.id}/change-class`,
      ),
    ).send({ classId: klassB.body.id });
    expect(changed.status).toBe(201);
    expect(changed.body.class.id).toBe(klassB.body.id);
  });

  it('refuse de changer vers une classe d’un autre niveau (400)', async () => {
    const { year, class: klassA } = await createClassInYear('2026-2027', {
      debut: '2026-09-01',
      fin: '2027-07-15',
    });
    const otherLevel = await auth(
      request(app.getHttpServer()).post('/levels'),
    ).send({
      cycleId: (await auth(request(app.getHttpServer()).get('/cycles'))).body[0]
        .id,
      code: 'CM1',
      nom: 'CM1',
    });
    const otherClass = await auth(
      request(app.getHttpServer()).post('/classes'),
    ).send({
      levelId: otherLevel.body.id,
      academicYearId: year.id,
      nom: 'CM1 A',
    });
    const student = await createStudent();
    const enrollment = await auth(
      request(app.getHttpServer()).post('/enrollments'),
    ).send({
      studentId: student.id,
      classId: klassA.id,
      academicYearId: year.id,
    });

    await auth(
      request(app.getHttpServer()).post(
        `/enrollments/${enrollment.body.id}/change-class`,
      ),
    )
      .send({ classId: otherClass.body.id })
      .expect(400);
  });
});

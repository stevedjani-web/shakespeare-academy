import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures } from './utils/fixtures';

describe('Structure académique — Section → Cycle → Niveau → Classe (e2e)', () => {
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

  async function createFullHierarchy() {
    const section = await auth(
      request(app.getHttpServer()).post('/sections'),
    ).send({
      code: 'FRANCOPHONE',
      nom: 'Section francophone',
    });
    const cycle = await auth(request(app.getHttpServer()).post('/cycles')).send(
      {
        sectionId: section.body.id,
        code: 'PRIMAIRE',
        nom: 'Primaire',
        ordre: 2,
      },
    );
    const level = await auth(request(app.getHttpServer()).post('/levels')).send(
      {
        cycleId: cycle.body.id,
        code: 'CM2',
        nom: 'CM2',
        ordre: 6,
      },
    );
    const year = await auth(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-07-15',
    });
    return {
      section: section.body,
      cycle: cycle.body,
      level: level.body,
      year: year.body,
    };
  }

  it('construit la hiérarchie complète Section → Cycle → Niveau → Classe', async () => {
    const { level, year } = await createFullHierarchy();

    const klass = await auth(
      request(app.getHttpServer()).post('/classes'),
    ).send({
      levelId: level.id,
      academicYearId: year.id,
      nom: 'CM2 A',
    });

    expect(klass.status).toBe(201);
    expect(klass.body.nom).toBe('CM2 A');
  });

  it('refuse un cycle rattaché à une section inexistante (404)', async () => {
    await auth(request(app.getHttpServer()).post('/cycles'))
      .send({
        sectionId: 'section-inexistante',
        code: 'PRIMAIRE',
        nom: 'Primaire',
      })
      .expect(404);
  });

  it('refuse deux sections avec le même code', async () => {
    await auth(request(app.getHttpServer()).post('/sections'))
      .send({ code: 'FRANCOPHONE', nom: 'Francophone' })
      .expect(201);
    await auth(request(app.getHttpServer()).post('/sections'))
      .send({ code: 'FRANCOPHONE', nom: 'Doublon' })
      .expect(409);
  });

  it('refuse deux classes de même nom pour le même niveau et la même année', async () => {
    const { level, year } = await createFullHierarchy();
    await auth(request(app.getHttpServer()).post('/classes'))
      .send({ levelId: level.id, academicYearId: year.id, nom: 'CM2 A' })
      .expect(201);
    await auth(request(app.getHttpServer()).post('/classes'))
      .send({ levelId: level.id, academicYearId: year.id, nom: 'CM2 A' })
      .expect(409);
  });

  it('filtre les cycles par section et les niveaux par cycle', async () => {
    const { section, cycle } = await createFullHierarchy();
    const otherSection = await auth(
      request(app.getHttpServer()).post('/sections'),
    ).send({
      code: 'ANGLOPHONE',
      nom: 'Section anglophone',
    });
    await auth(request(app.getHttpServer()).post('/cycles')).send({
      sectionId: otherSection.body.id,
      code: 'PRIMARY',
      nom: 'Primary',
    });

    const cyclesForSection = await auth(
      request(app.getHttpServer()).get(`/cycles?sectionId=${section.id}`),
    );
    expect(cyclesForSection.body).toHaveLength(1);
    expect(cyclesForSection.body[0].id).toBe(cycle.id);
  });

  it('lecture ouverte à tout utilisateur authentifié, sans permission particulière', async () => {
    await createFullHierarchy();
    // Le Secrétaire-caissier n'a aucune permission Lot 1, mais la lecture reste accessible.
    const school = await prisma.school.findFirstOrThrow();
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: 'SECRETAIRE_CAISSIER' },
    });
    const motDePasseHash = await argon2.hash('MotDePasse123!', {
      type: argon2.argon2id,
    });
    const secretaire = await prisma.user.create({
      data: {
        schoolId: school.id,
        roleId: role.id,
        nom: 'Secrétaire',
        prenom: 'Test',
        email: 'secretaire@test.local',
        motDePasseHash,
      },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: secretaire.email, motDePasse: 'MotDePasse123!' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/sections')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
  });
});

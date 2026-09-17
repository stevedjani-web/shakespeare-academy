import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

describe('Élèves et responsables (e2e)', () => {
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

  function baseStudent(overrides: Record<string, unknown> = {}) {
    return {
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
    };
  }

  it('crée un élève avec son responsable dans la même transaction, matricule auto-généré', async () => {
    const res = await auth(request(app.getHttpServer()).post('/students')).send(
      baseStudent(),
    );
    expect(res.status).toBe(201);
    expect(res.body.matricule).toBe('000001');
    expect(res.body.studentGuardians).toHaveLength(1);
    expect(res.body.studentGuardians[0].guardian.telephone).toBe(
      '242060000001',
    );
    expect(res.body.studentGuardians[0].prioritaire).toBe(true);
  });

  it('D31 (révisé) : crée un élève sans responsable — utile pour un import dont les contacts ne sont pas encore connus', async () => {
    const res = await auth(request(app.getHttpServer()).post('/students')).send(
      baseStudent({ responsable: undefined }),
    );
    expect(res.status).toBe(201);
    expect(res.body.studentGuardians).toHaveLength(0);
  });

  it('génère des matricules séquentiels pour deux élèves successifs', async () => {
    await auth(request(app.getHttpServer()).post('/students')).send(
      baseStudent(),
    );
    const second = await auth(
      request(app.getHttpServer()).post('/students'),
    ).send(
      baseStudent({
        nom: 'Bakala',
        prenom: 'Paul',
        dateNaissance: '2014-01-01',
        responsable: {
          nom: 'Bakala',
          prenom: 'Marie',
          telephone: '242060000002',
          lien: 'Mère',
        },
      }),
    );
    expect(second.body.matricule).toBe('000002');
  });

  it('réutilise le même responsable pour un deuxième enfant partageant son téléphone (pas de doublon Guardian)', async () => {
    await auth(request(app.getHttpServer()).post('/students')).send(
      baseStudent(),
    );
    await auth(request(app.getHttpServer()).post('/students')).send(
      baseStudent({
        nom: 'Moukala',
        prenom: 'Divine',
        dateNaissance: '2017-08-01',
      }),
    );
    const guardians = await prisma.guardian.findMany({
      where: { telephone: '242060000001' },
    });
    expect(guardians).toHaveLength(1);
  });

  it('D33 : signale un doublon potentiel (409) sans forcerCreation, laisse créer avec forcerCreation', async () => {
    await auth(request(app.getHttpServer()).post('/students')).send(
      baseStudent(),
    );

    const blocked = await auth(
      request(app.getHttpServer()).post('/students'),
    ).send(
      baseStudent({
        responsable: {
          nom: 'Autre',
          prenom: 'Contact',
          telephone: '242060000009',
          lien: 'Tuteur',
        },
      }),
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.doublonPotentiel).toBeDefined();

    const forced = await auth(
      request(app.getHttpServer()).post('/students'),
    ).send(
      baseStudent({
        forcerCreation: true,
        responsable: {
          nom: 'Autre',
          prenom: 'Contact',
          telephone: '242060000009',
          lien: 'Tuteur',
        },
      }),
    );
    expect(forced.status).toBe(201);
  });

  it('ne considère pas comme doublon un homonyme avec une date de naissance différente', async () => {
    await auth(request(app.getHttpServer()).post('/students')).send(
      baseStudent(),
    );
    const res = await auth(request(app.getHttpServer()).post('/students')).send(
      baseStudent({
        dateNaissance: '2016-01-01',
        responsable: {
          nom: 'X',
          prenom: 'Y',
          telephone: '242060000003',
          lien: 'Père',
        },
      }),
    );
    expect(res.status).toBe(201);
  });

  it('GET /students/search trouve par matricule, nom (insensible aux accents) et téléphone du responsable', async () => {
    const created = await auth(
      request(app.getHttpServer()).post('/students'),
    ).send(baseStudent());

    const byMatricule = await auth(
      request(app.getHttpServer()).get(
        `/students/search?q=${created.body.matricule}`,
      ),
    );
    expect(byMatricule.body.map((s: { id: string }) => s.id)).toContain(
      created.body.id,
    );

    const byName = await auth(
      request(app.getHttpServer()).get('/students/search?q=moukala'),
    );
    expect(byName.body.map((s: { id: string }) => s.id)).toContain(
      created.body.id,
    );

    const byPhone = await auth(
      request(app.getHttpServer()).get('/students/search?q=242060000001'),
    );
    expect(byPhone.body.map((s: { id: string }) => s.id)).toContain(
      created.body.id,
    );
  });

  it('GET /students/:id renvoie le dossier complet (identité, responsables, parcours)', async () => {
    const created = await auth(
      request(app.getHttpServer()).post('/students'),
    ).send(baseStudent());
    const dossier = await auth(
      request(app.getHttpServer()).get(`/students/${created.body.id}`),
    );
    expect(dossier.status).toBe(200);
    expect(dossier.body.studentGuardians).toHaveLength(1);
    expect(dossier.body.enrollments).toEqual([]);
  });

  it('rattache un deuxième responsable, puis le détache', async () => {
    const created = await auth(
      request(app.getHttpServer()).post('/students'),
    ).send(baseStudent());

    const attached = await auth(
      request(app.getHttpServer()).post(
        `/students/${created.body.id}/guardians`,
      ),
    ).send({
      nom: 'Moukala',
      prenom: 'Alphonse',
      telephone: '242060000005',
      lien: 'Oncle',
    });
    expect(attached.status).toBe(201);

    const dossier = await auth(
      request(app.getHttpServer()).get(`/students/${created.body.id}`),
    );
    expect(dossier.body.studentGuardians).toHaveLength(2);

    await auth(
      request(app.getHttpServer()).delete(
        `/students/${created.body.id}/guardians/${attached.body.guardianId}`,
      ),
    ).expect(200);

    const after = await auth(
      request(app.getHttpServer()).get(`/students/${created.body.id}`),
    );
    expect(after.body.studentGuardians).toHaveLength(1);
  });

  it('refuse de rattacher deux fois le même responsable au même élève', async () => {
    const created = await auth(
      request(app.getHttpServer()).post('/students'),
    ).send(baseStudent());
    await auth(
      request(app.getHttpServer()).post(
        `/students/${created.body.id}/guardians`,
      ),
    )
      .send({
        nom: 'Moukala',
        prenom: 'Jean',
        telephone: '242060000001',
        lien: 'Père',
      })
      .expect(409);
  });

  it('Secrétaire-caissier (STUDENT_READ + ENROLLMENT_MANAGE) peut créer un élève ; Direction (STUDENT_READ seul) ne le peut pas', async () => {
    const school = await prisma.school.findFirstOrThrow();
    const secretaire = await createUserWithRole(
      prisma,
      school.id,
      'SECRETAIRE_CAISSIER',
    );
    const direction = await createUserWithRole(prisma, school.id, 'DIRECTION');

    const secretaireLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: secretaire.user.email, motDePasse: secretaire.motDePasse })
      .expect(201);
    await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${secretaireLogin.body.accessToken}`)
      .send(baseStudent())
      .expect(201);

    const directionLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: direction.user.email, motDePasse: direction.motDePasse })
      .expect(201);
    await request(app.getHttpServer())
      .get('/students')
      .set('Authorization', `Bearer ${directionLogin.body.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${directionLogin.body.accessToken}`)
      .send(
        baseStudent({
          responsable: {
            nom: 'Z',
            prenom: 'Z',
            telephone: '242060000099',
            lien: 'Père',
          },
        }),
      )
      .expect(403);
  });
});

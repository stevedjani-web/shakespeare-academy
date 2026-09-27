import { existsSync, unlinkSync } from 'fs';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { assetPath } from '../src/receipt-assets/receipt-assets.storage';

/**
 * Reçus : cachet de l'établissement et signature de chaque caissier, enregistrés une fois puis posés automatiquement.
 * Les images sont privées (jamais dans le dossier public), la signature d'un reçu est celle du caissier qui a encaissé.
 */
describe('Cachet et signature des reçus (e2e)', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let schoolId: string;
  const files: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const school = await seedBaseFixtures(prisma);
    schoolId = school.id;
    admin = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
  });

  afterEach(() => {
    for (const f of files.splice(0)) if (existsSync(f)) unlinkSync(f);
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string, motDePasse: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, motDePasse })
      .expect(201);
    return res.body.accessToken as string;
  }
  async function tokenFor(roleCode: string, email: string) {
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      schoolId,
      roleCode,
      { email },
    );
    return login(user.email, motDePasse);
  }
  const png = (width = 900) =>
    sharp({
      create: {
        width,
        height: 300,
        channels: 4,
        background: { r: 20, g: 40, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  const upload = (
    path: string,
    token: string,
    buf: Buffer,
    contentType = 'image/png',
    filename = 'x.png',
  ) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buf, { filename, contentType });
  const get = (path: string, token: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);

  async function trackFile(column: 'school' | 'user', id?: string) {
    const name =
      column === 'school'
        ? (await prisma.school.findFirstOrThrow()).cachetFichier
        : (await prisma.user.findUniqueOrThrow({ where: { id } }))
            .signatureFichier;
    if (name) files.push(assetPath(name));
    return name;
  }

  describe('cachet de l’établissement', () => {
    it('se téléverse, se réduit, se relit et ne sort jamais du dossier public', async () => {
      await get('/receipt-assets/cachet', admin).expect(404);
      await upload('/receipt-assets/cachet', admin, await png()).expect(201);
      const name = await trackFile('school');
      expect(name).toMatch(/^[0-9a-f-]{36}\.png$/);
      const res = await get('/receipt-assets/cachet', admin).expect(200);
      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['cache-control']).toContain('no-store');
      // Réduit à 600 px de large au plus.
      const meta = await sharp(res.body as Buffer).metadata();
      expect(meta.width).toBeLessThanOrEqual(600);
      // Jamais servi par le dossier public ni exposé dans le profil public.
      await request(app.getHttpServer()).get(`/uploads/${name}`).expect(404);
      const pub = await request(app.getHttpServer())
        .get('/school/public')
        .expect(200);
      expect(JSON.stringify(pub.body)).not.toContain(name as string);
      const school = (await get('/school', admin)).body;
      expect(school.cachetFichier).toBeUndefined();
      expect(school.cachetEnregistre).toBe(true);
    });

    it('sans jeton 401 ; réservé aux réglages ; format et poids contrôlés', async () => {
      await request(app.getHttpServer())
        .get('/receipt-assets/cachet')
        .expect(401);
      const sec = await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local');
      await upload('/receipt-assets/cachet', sec, await png()).expect(403);
      // Le secrétariat lit (il imprime des reçus), sans pouvoir remplacer.
      await upload('/receipt-assets/cachet', admin, await png()).expect(201);
      await trackFile('school');
      await get('/receipt-assets/cachet', sec).expect(200);
      await upload(
        '/receipt-assets/cachet',
        admin,
        Buffer.from('GIF89a'),
        'image/gif',
        'x.gif',
      ).expect(400);
      // Un faux PNG (pas une image) est refusé et supprimé.
      await upload(
        '/receipt-assets/cachet',
        admin,
        Buffer.from('pas une image'),
      ).expect(400);
      await upload(
        '/receipt-assets/cachet',
        admin,
        Buffer.alloc(2 * 1024 * 1024 + 10, 1),
      ).expect(413);
      // Un enseignant n'a rien à voir avec les reçus.
      const ens = await tokenFor('ENSEIGNANT', 'ens@test.local');
      await get('/receipt-assets/cachet', ens).expect(403);
    });

    it('un remplacement supprime l’ancien fichier, le retrait aussi, le journal ne garde pas l’image', async () => {
      await upload('/receipt-assets/cachet', admin, await png()).expect(201);
      const first = await trackFile('school');
      await upload('/receipt-assets/cachet', admin, await png(400)).expect(201);
      const second = await trackFile('school');
      expect(second).not.toBe(first);
      expect(existsSync(assetPath(first as string))).toBe(false);
      await request(app.getHttpServer())
        .delete('/receipt-assets/cachet')
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);
      expect(existsSync(assetPath(second as string))).toBe(false);
      await get('/receipt-assets/cachet', admin).expect(404);
      const logs = await prisma.auditLog.findMany({
        where: { action: { startsWith: 'SCHOOL_CACHET' } },
      });
      expect(logs.map((l) => l.action).sort()).toEqual([
        'SCHOOL_CACHET_REMOVE',
        'SCHOOL_CACHET_UPDATE',
        'SCHOOL_CACHET_UPDATE',
      ]);
      expect(JSON.stringify(logs)).not.toContain(second as string);
    });
  });

  describe('signature du caissier', () => {
    it('chacun enregistre la sienne, seul celui qui encaisse peut le faire', async () => {
      const sec = await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local');
      const dir = await tokenFor('DIRECTION', 'dir@test.local');
      await get('/receipt-assets/signature/me', sec).expect(404);
      await upload('/receipt-assets/signature/me', sec, await png()).expect(
        201,
      );
      const secUser = await prisma.user.findFirstOrThrow({
        where: { email: 'sec@test.local' },
      });
      await trackFile('user', secUser.id);
      await get('/receipt-assets/signature/me', sec).expect(200);
      // Ce n'est pas la sienne pour un autre compte.
      await get('/receipt-assets/signature/me', admin).expect(404);
      // La Direction n'encaisse pas : elle n'a pas de signature de caissier.
      await upload('/receipt-assets/signature/me', dir, await png()).expect(
        403,
      );
      await request(app.getHttpServer())
        .delete('/receipt-assets/signature/me')
        .set('Authorization', `Bearer ${sec}`)
        .expect(200);
      await get('/receipt-assets/signature/me', sec).expect(404);
    });

    it('la signature posée sur un reçu est celle du caissier qui a encaissé', async () => {
      const sec = await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local');
      const other = await tokenFor('SECRETAIRE_CAISSIER', 'sec2@test.local');
      const line = await createInvoiceLine();
      const pay = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${sec}`)
        .send({ invoiceLineId: line, montant: 10000, modePaiement: 'ESPECES' })
        .expect(201);
      // Sans signature enregistrée : 404, le reçu s'imprime alors avec l'emplacement vide.
      await get(`/receipt-assets/signature/payment/${pay.body.id}`, sec).expect(
        404,
      );
      await upload('/receipt-assets/signature/me', sec, await png()).expect(
        201,
      );
      const secUser = await prisma.user.findFirstOrThrow({
        where: { email: 'sec@test.local' },
      });
      await trackFile('user', secUser.id);
      // Même une collègue qui imprime le reçu voit la signature de celui qui a encaissé.
      await get(
        `/receipt-assets/signature/payment/${pay.body.id}`,
        other,
      ).expect(200);
      // Elle ne peut pas y mettre la sienne : sa propre signature n'est jamais utilisée pour ce reçu.
      await upload(
        '/receipt-assets/signature/me',
        other,
        await sharp({
          create: { width: 50, height: 50, channels: 3, background: '#fff' },
        })
          .png()
          .toBuffer(),
      ).expect(201);
      const otherUser = await prisma.user.findFirstOrThrow({
        where: { email: 'sec2@test.local' },
      });
      await trackFile('user', otherUser.id);
      const res = await get(
        `/receipt-assets/signature/payment/${pay.body.id}`,
        other,
      ).expect(200);
      // C'est bien l'image du caissier (900 px réduite à 600), jamais celle de la collègue (50 px).
      expect((await sharp(res.body as Buffer).metadata()).width).toBe(600);
      await get('/receipt-assets/signature/payment/inconnu', sec).expect(404);
      await request(app.getHttpServer())
        .get(`/receipt-assets/signature/payment/${pay.body.id}`)
        .expect(401);
    });
  });

  async function createInvoiceLine(): Promise<string> {
    const a = (r: request.Test) => r.set('Authorization', `Bearer ${admin}`);
    const section = await a(
      request(app.getHttpServer()).post('/sections'),
    ).send({
      code: 'FR',
      nom: 'Francophone',
    });
    const cycle = await a(request(app.getHttpServer()).post('/cycles')).send({
      sectionId: section.body.id,
      code: 'PRIMAIRE',
      nom: 'Primaire',
    });
    const level = await a(request(app.getHttpServer()).post('/levels')).send({
      cycleId: cycle.body.id,
      code: 'CM2',
      nom: 'CM2',
    });
    const year = await a(
      request(app.getHttpServer()).post('/academic-years'),
    ).send({
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-07-15',
    });
    const klass = await a(request(app.getHttpServer()).post('/classes')).send({
      levelId: level.body.id,
      academicYearId: year.body.id,
      nom: 'CM2 A',
    });
    const feeType = await a(
      request(app.getHttpServer()).post('/fee-types'),
    ).send({
      code: 'INSCRIPTION',
      nom: "Frais d'inscription",
      obligatoire: true,
      avecTranches: false,
    });
    await a(request(app.getHttpServer()).post('/fee-schedules')).send({
      academicYearId: year.body.id,
      levelId: level.body.id,
      feeTypeId: feeType.body.id,
      montant: 45000,
    });
    const student = await a(
      request(app.getHttpServer()).post('/students'),
    ).send({
      nom: 'Moukala',
      prenom: 'Grace',
      sexe: 'F',
      dateNaissance: '2015-04-12',
    });
    const enrollment = await a(
      request(app.getHttpServer()).post('/enrollments'),
    ).send({
      studentId: student.body.id,
      classId: klass.body.id,
      academicYearId: year.body.id,
    });
    const invoice = await a(
      request(app.getHttpServer()).get(
        `/invoices/by-enrollment/${enrollment.body.id}`,
      ),
    );
    return invoice.body.lines[0].id as string;
  }
});

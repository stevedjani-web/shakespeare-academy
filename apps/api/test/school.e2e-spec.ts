import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

describe('Paramétrage établissement (e2e)', () => {
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

  it('GET /school est lisible par tout utilisateur authentifié', async () => {
    const res = await request(app.getHttpServer())
      .get('/school')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.devise).toBe('XAF');
    expect(res.body.fuseauHoraire).toBe('Africa/Brazzaville');
  });

  it('GET /school/public est ouvert sans compte et ne renvoie que l’identité de l’établissement', async () => {
    const school = await prisma.school.findFirstOrThrow();
    await prisma.school.update({
      where: { id: school.id },
      data: {
        adresse: '12 avenue de la Paix',
        telephone: '06 853 8686',
        logoUrl: '/uploads/school/logo.png',
        seuilImpayeCritiqueFcfa: 250000,
        directeurNom: 'Jean Dupont',
      },
    });
    const res = await request(app.getHttpServer())
      .get('/school/public')
      .expect(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'adresse',
      'logoUrl',
      'nom',
      'telephone',
    ]);
    expect(res.body.nom).toBe(school.nom);
    expect(res.body.logoUrl).toBe('/uploads/school/logo.png');
    expect(JSON.stringify(res.body)).not.toContain('250000');
    expect(JSON.stringify(res.body)).not.toContain('Dupont');
  });

  it('PATCH /school exige SETTINGS_MANAGE', async () => {
    const school = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      school.id,
      'SECRETAIRE_CAISSIER',
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, motDePasse })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/school')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ nom: 'Nouveau nom' })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/school')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nom: 'Shakespeare Academy — Pointe-Noire' })
      .expect(200);
  });

  const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  it('POST /school/logo enregistre le logo et exige SETTINGS_MANAGE', async () => {
    const school = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      school.id,
      'SECRETAIRE_CAISSIER',
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, motDePasse })
      .expect(201);

    await request(app.getHttpServer())
      .post('/school/logo')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .attach('file', TINY_PNG, 'logo.png')
      .expect(403);

    const res = await request(app.getHttpServer())
      .post('/school/logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', TINY_PNG, 'logo.png')
      .expect(201);
    expect(res.body.logoUrl).toMatch(/^\/uploads\/school\/.+\.png$/);
  });

  describe('réduction du logo à l’enregistrement', () => {
    const uploaded = (logoUrl: string) => join(process.cwd(), logoUrl);

    // Une image grande et peu compressible : du bruit, comme une photo ou un export lourd.
    async function bigPng(width: number, height: number) {
      const raw = Buffer.alloc(width * height * 3);
      for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
      return sharp(raw, { raw: { width, height, channels: 3 } })
        .png({ compressionLevel: 0 })
        .toBuffer();
    }

    it('réduit un logo trop large et trop lourd, sans le déformer', async () => {
      const original = await bigPng(1600, 800);
      const res = await request(app.getHttpServer())
        .post('/school/logo')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', original, 'logo.png')
        .expect(201);
      const path = uploaded(res.body.logoUrl);
      const meta = await sharp(path).metadata();
      expect(meta.width).toBe(800);
      expect(meta.height).toBe(400);
      expect(meta.format).toBe('png');
      expect((await stat(path)).size).toBeLessThan(original.length / 2);
      await unlink(path);
    });

    it('garde la transparence d’un logo PNG', async () => {
      const transparent = await sharp({
        create: {
          width: 1600,
          height: 800,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
      const res = await request(app.getHttpServer())
        .post('/school/logo')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', transparent, 'logo.png')
        .expect(201);
      const path = uploaded(res.body.logoUrl);
      const meta = await sharp(path).metadata();
      expect(meta.hasAlpha).toBe(true);
      expect(meta.width).toBe(800);
      await unlink(path);
    });

    it('n’agrandit jamais un petit logo', async () => {
      const res = await request(app.getHttpServer())
        .post('/school/logo')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PNG, 'logo.png')
        .expect(201);
      const path = uploaded(res.body.logoUrl);
      const meta = await sharp(path).metadata();
      expect(meta.width).toBe(1);
      await unlink(path);
    });

    it('accepte un JPEG et le réduit', async () => {
      const jpeg = await sharp(await bigPng(1600, 800))
        .jpeg({ quality: 100 })
        .toBuffer();
      const res = await request(app.getHttpServer())
        .post('/school/logo')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', jpeg, {
          filename: 'logo.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);
      const path = uploaded(res.body.logoUrl);
      const meta = await sharp(path).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(800);
      await unlink(path);
    });

    it('refuse et supprime un fichier qui se dit PNG sans en être un', async () => {
      const before = await readdir(join(process.cwd(), 'uploads', 'school'));
      const school = await prisma.school.findFirstOrThrow();
      await request(app.getHttpServer())
        .post('/school/logo')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('ceci n’est pas une image'), {
          filename: 'logo.png',
          contentType: 'image/png',
        })
        .expect(400);
      const after = await readdir(join(process.cwd(), 'uploads', 'school'));
      expect(after.sort()).toEqual(before.sort());
      const unchanged = await prisma.school.findFirstOrThrow();
      expect(unchanged.logoUrl).toBe(school.logoUrl);
    });
  });

  it('POST /school/logo refuse un format non autorisé (400)', async () => {
    await request(app.getHttpServer())
      .post('/school/logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('not an image'), 'logo.txt')
      .expect(400);
  });
});

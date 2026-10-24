import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { createUserWithRole, seedBaseFixtures } from './utils/fixtures';
import { STAFF_CONSENT_VERSION } from '../src/teacher-onboarding/teacher-onboarding.util';

jest.setTimeout(30000);

/** Collecte des informations des enseignants par un lien commun, validée par le secrétariat. */
describe('Collecte des enseignants (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let secretaryToken: string;
  let token: string; // jeton du lien partagé
  let ipCounter = 0;
  const PASSWORD = 'MonMotDePasse1!';
  const photoDir = join(process.cwd(), 'private-uploads', 'teacher-photos');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    adminToken = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
    const school = await prisma.school.findFirstOrThrow();
    const sec = await createUserWithRole(
      prisma,
      school.id,
      'SECRETAIRE_CAISSIER',
    );
    secretaryToken = await login(sec.user.email!, sec.motDePasse);
    const link = await asSecretary(
      request(app.getHttpServer()).post('/teacher-onboarding/link'),
    )
      .send({})
      .expect(201);
    token = link.body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(identifiant: string, motDePasse: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifiant, motDePasse })
      .expect(201);
    return res.body.accessToken as string;
  }
  const asSecretary = (req: request.Test) =>
    req.set('Authorization', `Bearer ${secretaryToken}`);
  const asAdmin = (req: request.Test) =>
    req.set('Authorization', `Bearer ${adminToken}`);

  async function png(): Promise<Buffer> {
    return sharp({
      create: { width: 120, height: 90, channels: 3, background: '#3355aa' },
    })
      .png()
      .toBuffer();
  }

  const payload = (extra: Record<string, unknown> = {}) => ({
    nom: 'Kimpolo',
    prenom: 'Régina',
    telephone: '+242 06 000 0001',
    email: 'regina@exemple.test',
    urgenceNom: 'Paul Kimpolo',
    urgenceTelephone: '06 000 0009',
    matieres: [] as string[],
    motDePasse: PASSWORD,
    consentement: true,
    versionPolitique: STAFF_CONSENT_VERSION,
    ...extra,
  });

  /** Envoi public (JSON ou multipart avec photo) avec une adresse distincte par appel (la limite d'abus est par adresse). */
  function send(
    body: Record<string, unknown>,
    opts: { photo?: Buffer; ip?: string; token?: string } = {},
  ) {
    const req = request(app.getHttpServer())
      .post(`/teacher-onboarding/public/${opts.token ?? token}`)
      .set('X-Forwarded-For', opts.ip ?? `10.0.0.${++ipCounter}`);
    if (opts.photo) {
      return req
        .field('payload', JSON.stringify(body))
        .attach('photo', opts.photo, 'photo.png');
    }
    return req.send(body);
  }

  async function subject(code: string, nom: string) {
    const school = await prisma.school.findFirstOrThrow();
    return prisma.subject.create({ data: { schoolId: school.id, code, nom } });
  }

  async function teacher(nom: string, prenom: string, extra = {}) {
    const school = await prisma.school.findFirstOrThrow();
    return prisma.teacher.create({
      data: { schoolId: school.id, nom, prenom, ...extra },
    });
  }

  async function submitted(
    extra: Record<string, unknown> = {},
    photo?: Buffer,
  ) {
    const res = await send(payload(extra), { photo }).expect(201);
    expect(res.body).toEqual({ recu: true });
    const rows = await prisma.teacherSubmission.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows[0];
  }

  const validate = (id: string, body: object, t = asSecretary) =>
    t(
      request(app.getHttpServer()).post(
        `/teacher-onboarding/submissions/${id}/valider`,
      ),
    ).send(body);

  describe('droits', () => {
    it('le secrétariat, l’administrateur et la Direction gèrent la collecte ; les autres rôles et les inconnus non', async () => {
      const school = await prisma.school.findFirstOrThrow();
      await asSecretary(
        request(app.getHttpServer()).get('/teacher-onboarding/link'),
      ).expect(200);
      await asAdmin(
        request(app.getHttpServer()).get('/teacher-onboarding/submissions'),
      ).expect(200);
      const dir = await createUserWithRole(prisma, school.id, 'DIRECTION');
      const dirToken = await login(dir.user.email!, dir.motDePasse);
      await request(app.getHttpServer())
        .get('/teacher-onboarding/teachers')
        .set('Authorization', `Bearer ${dirToken}`)
        .expect(200);

      for (const role of [
        'SURVEILLANT',
        'COMPTABLE',
        'ENSEIGNANT',
        'AUDITEUR',
      ]) {
        const u = await createUserWithRole(prisma, school.id, role);
        const t = await login(u.user.email!, u.motDePasse);
        for (const path of [
          '/teacher-onboarding/link',
          '/teacher-onboarding/submissions',
          '/teacher-onboarding/teachers',
        ]) {
          await request(app.getHttpServer())
            .get(path)
            .set('Authorization', `Bearer ${t}`)
            .expect(403);
        }
        await request(app.getHttpServer())
          .post('/teacher-onboarding/submissions/x/valider')
          .set('Authorization', `Bearer ${t}`)
          .send({ creerFiche: true })
          .expect(403);
      }
      await request(app.getHttpServer())
        .get('/teacher-onboarding/link')
        .expect(401);
      await request(app.getHttpServer())
        .post('/teacher-onboarding/submissions/x/refuser')
        .send({ motif: 'non' })
        .expect(401);
    });

    it('la migration donne le droit à tout rôle qui gère les inscriptions ou le référentiel pédagogique', async () => {
      const perm = await prisma.permission.findUniqueOrThrow({
        where: { code: 'TEACHER_ONBOARDING_MANAGE' },
      });
      await prisma.rolePermission.deleteMany({
        where: { permissionId: perm.id },
      });
      const sql = readFileSync(
        join(
          __dirname,
          '../prisma/migrations/20261024100000_collecte_enseignants/migration.sql',
        ),
        'utf8',
      );
      const grant = sql.slice(sql.indexOf('INSERT INTO "permissions"'));
      for (const stmt of grant
        .split(/;\s*\n/)
        .filter((s) => s.includes('INSERT'))) {
        await prisma.$executeRawUnsafe(stmt);
      }
      const holders = await prisma.rolePermission.findMany({
        where: { permissionId: perm.id },
        include: { role: true },
      });
      expect(holders.map((h) => h.role.code).sort()).toEqual(
        ['ADMINISTRATEUR', 'DIRECTION', 'SECRETAIRE_CAISSIER'].sort(),
      );
    });
  });

  describe('lien partagé', () => {
    it('un seul lien : créé une fois, remplacé sur demande (l’ancien s’éteint), fermé, rouvert, prolongé, expiré', async () => {
      const again = await asSecretary(
        request(app.getHttpServer()).post('/teacher-onboarding/link'),
      ).send({});
      expect(again.body.token).toBe(token);

      const fresh = await asSecretary(
        request(app.getHttpServer()).post('/teacher-onboarding/link'),
      )
        .send({ regenerer: true, validiteJours: 7 })
        .expect(201);
      expect(fresh.body.token).not.toBe(token);
      await request(app.getHttpServer())
        .get(`/teacher-onboarding/public/${token}`)
        .expect(404);
      const t2 = fresh.body.token;
      await request(app.getHttpServer())
        .get(`/teacher-onboarding/public/${t2}`)
        .expect(200);

      await asSecretary(
        request(app.getHttpServer()).patch('/teacher-onboarding/link'),
      )
        .send({ actif: false })
        .expect(200);
      await request(app.getHttpServer())
        .get(`/teacher-onboarding/public/${t2}`)
        .expect(410);
      await send(payload(), { token: t2 }).expect(410);
      await asSecretary(
        request(app.getHttpServer()).patch('/teacher-onboarding/link'),
      )
        .send({ actif: true })
        .expect(200);
      await request(app.getHttpServer())
        .get(`/teacher-onboarding/public/${t2}`)
        .expect(200);

      await prisma.teacherCollectLink.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await request(app.getHttpServer())
        .get(`/teacher-onboarding/public/${t2}`)
        .expect(410);
      const extended = await asSecretary(
        request(app.getHttpServer()).patch('/teacher-onboarding/link'),
      )
        .send({ prolongerJours: 10 })
        .expect(200);
      expect(extended.body.expire).toBe(false);
      await request(app.getHttpServer())
        .get(`/teacher-onboarding/public/${t2}`)
        .expect(200);

      const actions = (
        await prisma.auditLog.findMany({
          where: { action: { startsWith: 'TEACHER_LINK_' } },
        })
      ).map((l) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'TEACHER_LINK_CREATE',
          'TEACHER_LINK_REGENERATE',
          'TEACHER_LINK_CLOSE',
          'TEACHER_LINK_REOPEN',
          'TEACHER_LINK_EXTEND',
        ]),
      );
    });

    it('la page publique ne montre que l’école, les matières et la version des conditions ; un lien inconnu donne 404', async () => {
      await subject('MATH', 'Mathématiques');
      const res = await request(app.getHttpServer())
        .get(`/teacher-onboarding/public/${token}`)
        .expect(200);
      expect(Object.keys(res.body).sort()).toEqual(
        ['ecole', 'matieres', 'versionPolitique'].sort(),
      );
      expect(res.body.versionPolitique).toBe(STAFF_CONSENT_VERSION);
      expect(res.body.matieres).toEqual([
        { id: expect.any(String), nom: 'Mathématiques' },
      ]);
      await request(app.getHttpServer())
        .get('/teacher-onboarding/public/inconnu')
        .expect(404);
    });
  });

  describe('envoi par l’enseignant', () => {
    it('refuse : sans consentement, mauvaise version, numéro ou mot de passe trop courts, nom manquant, matière inconnue, champ inattendu', async () => {
      await send(payload({ consentement: false })).expect(400);
      await send(payload({ versionPolitique: 'ancienne' })).expect(400);
      await send(payload({ telephone: '1234567' })).expect(400);
      await send(payload({ telephone: 'abcdefghij' })).expect(400);
      await send(payload({ urgenceTelephone: '123' })).expect(400);
      await send(payload({ motDePasse: 'court' })).expect(400);
      await send(payload({ nom: '' })).expect(400);
      await send(payload({ email: 'pas-un-email' })).expect(400);
      await send(payload({ matieres: ['inconnue'] })).expect(400);
      await send(payload({ role: 'DIRECTION' })).expect(400);
      expect(await prisma.teacherSubmission.count()).toBe(0);
    });

    it('enregistre la demande avec une empreinte du mot de passe et la clé du numéro, sans rien créer d’autre', async () => {
      const math = await subject('MATH', 'Mathématiques');
      const sub = await submitted({ matieres: [math.id, math.id] });
      expect(sub.statut).toBe('EN_ATTENTE');
      expect(sub.telephoneCle).toBe('060000001');
      expect(sub.motDePasseHash).toMatch(/^\$argon2id\$/);
      expect(sub.motDePasseHash).not.toContain(PASSWORD);
      expect(sub.matieres).toEqual([math.id]);
      expect(await prisma.teacher.count()).toBe(0);
      expect(
        await prisma.user.count({ where: { telephoneCle: '060000001' } }),
      ).toBe(0);
    });

    it('une seconde demande pour le même numéro, écrit autrement, est refusée tant que la première attend', async () => {
      await submitted();
      await send(payload({ nom: 'Autre', telephone: '060000001' })).expect(409);
      expect(await prisma.teacherSubmission.count()).toBe(1);
    });

    it('le journal ne contient ni nom, ni numéro, ni e-mail, ni mot de passe', async () => {
      await submitted();
      const logs = JSON.stringify(
        await prisma.auditLog.findMany({
          where: { action: 'TEACHER_ONBOARDING_SUBMIT' },
        }),
      );
      expect(logs).toContain('TEACHER_ONBOARDING_SUBMIT');
      for (const secret of [
        'Kimpolo',
        'Régina',
        '060000001',
        'regina@',
        PASSWORD,
      ]) {
        expect(logs).not.toContain(secret);
      }
    });

    it('limite les envois par adresse (429)', async () => {
      const previous = process.env.COLLECTE_ENSEIGNANTS_LIMITE_PAR_HEURE;
      process.env.COLLECTE_ENSEIGNANTS_LIMITE_PAR_HEURE = '2';
      try {
        const ip = '203.0.113.7';
        await send(payload({ telephone: '06 000 1001' }), { ip }).expect(201);
        await send(payload({ telephone: '06 000 1002' }), { ip }).expect(201);
        await send(payload({ telephone: '06 000 1003' }), { ip }).expect(429);
        await send(payload({ telephone: '06 000 1003' }), {
          ip: '203.0.113.8',
        }).expect(201);
      } finally {
        if (previous === undefined) {
          delete process.env.COLLECTE_ENSEIGNANTS_LIMITE_PAR_HEURE;
        } else {
          process.env.COLLECTE_ENSEIGNANTS_LIMITE_PAR_HEURE = previous;
        }
      }
    });

    it('une photo est décodée, recadrée en portrait 450 x 600 et gardée dans un dossier privé ; un faux fichier est refusé sans rien laisser', async () => {
      const before = existsSync(photoDir) ? readdirSync(photoDir).length : 0;
      const sub = await submitted({}, await png());
      expect(sub.photoFichier).toMatch(/\.jpg$/);
      expect(readdirSync(photoDir).length).toBe(before + 1);

      const meta = await sharp(join(photoDir, sub.photoFichier!)).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual([
        'jpeg',
        450,
        600,
      ]);

      await send(payload({ telephone: '06 000 2002' }), {
        photo: Buffer.from('ceci n’est pas une image'),
      }).expect(400);
      expect(readdirSync(photoDir).length).toBe(before + 1);
      expect(await prisma.teacherSubmission.count()).toBe(1);

      const big = Buffer.concat([await png(), Buffer.alloc(4 * 1024 * 1024)]);
      await send(payload({ telephone: '06 000 2003' }), { photo: big }).expect(
        413,
      );
      expect(readdirSync(photoDir).length).toBe(before + 1);

      // Jamais servie publiquement, seulement au personnel habilité.
      await request(app.getHttpServer())
        .get(`/uploads/${sub.photoFichier}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/teacher-onboarding/submissions/${sub.id}/photo`)
        .expect(401);
      const res = await asSecretary(
        request(app.getHttpServer()).get(
          `/teacher-onboarding/submissions/${sub.id}/photo`,
        ),
      ).expect(200);
      expect(res.headers['content-type']).toContain('image/jpeg');
      expect(res.headers['cache-control']).toContain('no-store');
      await asSecretary(
        request(app.getHttpServer()).get(
          '/teacher-onboarding/submissions/inconnue/photo',
        ),
      ).expect(404);
    });

    it('avant la validation, le bon mot de passe donne « demande en cours de vérification », jamais un mauvais ou un autre numéro', async () => {
      await submitted();
      const ok = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ identifiant: '060000001', motDePasse: PASSWORD })
        .expect(403);
      expect(ok.body.message).toContain('en cours de vérification');
      const wrong = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ identifiant: '060000001', motDePasse: 'mauvais' })
        .expect(401);
      const other = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ identifiant: '060000077', motDePasse: PASSWORD })
        .expect(401);
      expect(other.body.message).toBe(wrong.body.message);
    });
  });

  describe('file du secrétariat', () => {
    it('liste les demandes à valider avec les matières déclarées, puis les demandes traitées', async () => {
      const math = await subject('MATH', 'Mathématiques');
      const sub = await submitted({ matieres: [math.id] });
      const waiting = (
        await asSecretary(
          request(app.getHttpServer()).get(
            '/teacher-onboarding/submissions?statut=EN_ATTENTE',
          ),
        ).expect(200)
      ).body;
      expect(waiting).toHaveLength(1);
      expect(waiting[0]).toMatchObject({
        id: sub.id,
        nom: 'Kimpolo',
        telephone: '+242 06 000 0001',
        statut: 'EN_ATTENTE',
        photo: false,
        matieres: [{ id: math.id, nom: 'Mathématiques' }],
      });
      expect(waiting[0]).not.toHaveProperty('motDePasseHash');
      expect(waiting[0]).not.toHaveProperty('telephoneCle');
      const done = (
        await asSecretary(
          request(app.getHttpServer()).get(
            '/teacher-onboarding/submissions?statut=TRAITEES',
          ),
        ).expect(200)
      ).body;
      expect(done).toEqual([]);
    });

    it('le suivi des fiches ne montre que des indicateurs : compte, numéro, photo, demande en attente', async () => {
      const kimpolo = await teacher('KIMPOLO', 'Régina');
      await teacher('AVA', 'Gervais', { telephone: '06 000 0003' });
      await submitted();
      const res = await asSecretary(
        request(app.getHttpServer()).get('/teacher-onboarding/teachers'),
      ).expect(200);
      const k = res.body.find((t: { id: string }) => t.id === kimpolo.id);
      expect(k).toMatchObject({
        aCompte: false,
        aTelephone: false,
        aPhoto: false,
        demandeEnAttente: true,
      });
      const a = res.body.find((t: { nom: string }) => t.nom === 'AVA');
      expect(a).toMatchObject({ aTelephone: true, demandeEnAttente: false });
      expect(JSON.stringify(res.body)).not.toContain('06 000 0003');
    });
  });

  describe('rapprochement avec les fiches', () => {
    const analyse = (id: string, query = '') =>
      asSecretary(
        request(app.getHttpServer()).get(
          `/teacher-onboarding/submissions/${id}/analyse${query}`,
        ),
      );

    it('propose la fiche qui porte le même nom (accents, casse et ordre ignorés), jamais sans certitude', async () => {
      const exact = await teacher('KIMPOLO', 'Regina');
      await teacher('AVA', 'Gervais');
      const sub = await submitted({ nom: 'regina', prenom: 'KIMPOLO' });
      const res = (await analyse(sub.id).expect(200)).body;
      expect(res.propose).toBe(exact.id);
      expect(res.candidats[0]).toMatchObject({
        id: exact.id,
        correspondance: 'EXACT',
      });
      expect(res.candidats).toHaveLength(1);
      expect(res.alertes.map((a: { code: string }) => a.code)).not.toContain(
        'NOUVELLE_FICHE',
      );
    });

    it('ne propose rien quand deux fiches se ressemblent autant, ou quand aucune ne ressemble', async () => {
      await teacher('OSSELE', 'Pauline');
      await teacher('OSSELE', 'Pauline Nicaise');
      const sub = await submitted({ nom: 'Ossele', prenom: 'Pauline' });
      const res = (await analyse(sub.id).expect(200)).body;
      expect(res.candidats.length).toBeGreaterThanOrEqual(2);

      await prisma.teacherSubmission.deleteMany();
      const none = await submitted({
        nom: 'Zebaze',
        prenom: 'Armand',
        telephone: '06 000 4004',
      });
      const r2 = (await analyse(none.id).expect(200)).body;
      expect(r2.propose).toBeNull();
      expect(r2.candidats).toEqual([]);
      expect(r2.alertes.map((a: { code: string }) => a.code)).toContain(
        'NOUVELLE_FICHE',
      );
    });

    it('signale ce qui bloque ou demande confirmation', async () => {
      const school = await prisma.school.findFirstOrThrow();
      const role = await prisma.role.findUniqueOrThrow({
        where: { code: 'ENSEIGNANT' },
      });
      const linked = await teacher('KIMPOLO', 'Régina', {
        telephone: '06 000 7777',
        email: 'ancien@exemple.test',
        photoFichier: 'ancienne.jpg',
      });
      const holder = await prisma.user.create({
        data: {
          schoolId: school.id,
          roleId: role.id,
          nom: 'Autre',
          prenom: 'Compte',
          email: 'regina@exemple.test',
          telephone: '06 000 5555',
          telephoneCle: '060005555',
          motDePasseHash: 'x',
        },
      });
      await prisma.teacher.update({
        where: { id: linked.id },
        data: { userId: holder.id },
      });
      const sub = await submitted({}, await png());
      const codes = (
        (await analyse(sub.id, `?teacherId=${linked.id}`).expect(200)).body
          .alertes as Array<{ code: string; gravite: string }>
      ).map((a) => `${a.gravite}:${a.code}`);
      expect(codes).toEqual(
        expect.arrayContaining([
          'BLOQUANT:FICHE_DEJA_RELIEE',
          'CONFIRMATION:EMAIL_DEJA_UTILISE',
          'CONFIRMATION:TELEPHONE_FICHE_DIFFERENT',
          'CONFIRMATION:EMAIL_FICHE_DIFFERENT',
          'CONFIRMATION:PHOTO_DIFFERENTE',
        ]),
      );
      await analyse('inconnue').expect(404);
      await analyse(sub.id, '?teacherId=inconnue').expect(404);
    });
  });

  describe('validation', () => {
    it('rattache la demande à une fiche, crée le compte au rôle Enseignant et l’enseignant se connecte avec son numéro et SON mot de passe', async () => {
      const math = await subject('MATH', 'Mathématiques');
      const fiche = await teacher('KIMPOLO', 'Régina');
      const sub = await submitted({ matieres: [math.id] }, await png());

      const res = await validate(sub.id, {
        teacherId: fiche.id,
        modePointage: 'JOURNEE',
      }).expect(201);
      expect(res.body.teacherId).toBe(fiche.id);

      const after = await prisma.teacher.findUniqueOrThrow({
        where: { id: fiche.id },
        include: { subjects: true, user: { include: { role: true } } },
      });
      expect(after.userId).toBe(res.body.userId);
      expect(after.user?.role.code).toBe('ENSEIGNANT');
      expect(after.user?.doitChangerMotDePasse).toBe(false);
      expect(after.user?.telephoneCle).toBe('060000001');
      expect(after.user?.email).toBe('regina@exemple.test');
      expect(after.telephone).toBe('+242 06 000 0001');
      expect(after.email).toBe('regina@exemple.test');
      expect(after.urgenceNom).toBe('Paul Kimpolo');
      expect(after.modePointage).toBe('JOURNEE');
      expect(after.subjects.map((s) => s.subjectId)).toEqual([math.id]);
      expect(after.photoFichier).toBe(sub.photoFichier);

      const stored = await prisma.teacherSubmission.findUniqueOrThrow({
        where: { id: sub.id },
      });
      expect(stored.statut).toBe('VALIDEE');
      expect(stored.motDePasseHash).toBeNull();
      expect(stored.userId).toBe(res.body.userId);

      // Il se connecte avec son numéro écrit de plusieurs façons et le mot de passe qu'il a choisi.
      for (const written of ['+242 06 000 0001', '060000001', '06 000 0001']) {
        const ok = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ identifiant: written, motDePasse: PASSWORD })
          .expect(201);
        expect(ok.body.user.roleCode).toBe('ENSEIGNANT');
        expect(ok.body.user.doitChangerMotDePasse).toBe(false);
      }
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ identifiant: '060000001', motDePasse: 'mauvais' })
        .expect(401);

      // La photo de la fiche se lit avec le jeton du personnel, pas sans.
      await asSecretary(
        request(app.getHttpServer()).get(
          `/teacher-onboarding/teachers/${fiche.id}/photo`,
        ),
      ).expect(200);
      await request(app.getHttpServer())
        .get(`/teacher-onboarding/teachers/${fiche.id}/photo`)
        .expect(401);

      // Une seconde validation est refusée.
      await validate(sub.id, { teacherId: fiche.id }).expect(409);
      expect(
        await prisma.user.count({ where: { telephoneCle: '060000001' } }),
      ).toBe(1);

      const journal = JSON.stringify(
        await prisma.auditLog.findMany({
          where: { action: 'TEACHER_ONBOARDING_VALIDATE' },
        }),
      );
      expect(journal).toContain(res.body.userId);
      for (const secret of [
        'Kimpolo',
        '060000001',
        'regina@',
        PASSWORD,
        'argon2',
      ]) {
        expect(journal).not.toContain(secret);
      }
    });

    it('crée une nouvelle fiche quand l’enseignant n’en a pas, avec le mode choisi (séance par défaut)', async () => {
      const sub = await submitted({
        nom: 'Zebaze',
        prenom: 'Armand',
        telephone: '06 000 4004',
      });
      const res = await validate(sub.id, { creerFiche: true }).expect(201);
      const fiche = await prisma.teacher.findUniqueOrThrow({
        where: { id: res.body.teacherId },
      });
      expect([
        fiche.nom,
        fiche.prenom,
        fiche.modePointage,
        fiche.statut,
      ]).toEqual(['Zebaze', 'Armand', 'SEANCE', 'ACTIF']);
      expect(fiche.userId).toBe(res.body.userId);

      const sub2 = await submitted({
        nom: 'Nzila',
        prenom: 'Berthe',
        telephone: '06 000 4005',
        email: undefined,
      });
      const r2 = await validate(sub2.id, {
        creerFiche: true,
        modePointage: 'JOURNEE',
      }).expect(201);
      expect(
        (
          await prisma.teacher.findUniqueOrThrow({
            where: { id: r2.body.teacherId },
          })
        ).modePointage,
      ).toBe('JOURNEE');
    });

    it('exige UNE fiche existante OU la création d’une fiche, jamais les deux ni aucune', async () => {
      const fiche = await teacher('KIMPOLO', 'Régina');
      const sub = await submitted();
      await validate(sub.id, {}).expect(400);
      await validate(sub.id, { teacherId: fiche.id, creerFiche: true }).expect(
        400,
      );
      await validate(sub.id, { teacherId: 'inconnue' }).expect(404);
      await validate('inconnue', { creerFiche: true }).expect(404);
      expect(
        (
          await prisma.teacherSubmission.findUniqueOrThrow({
            where: { id: sub.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
    });

    it('demande confirmation quand une valeur de la fiche va être remplacée, ou qu’une fiche très proche existe', async () => {
      const fiche = await teacher('KIMPOLO', 'Régina', {
        telephone: '06 000 7777',
        email: 'ancien@exemple.test',
      });
      const sub = await submitted();
      const refused = await validate(sub.id, { teacherId: fiche.id }).expect(
        409,
      );
      expect(refused.body.message).toContain('Confirmation requise');
      expect(refused.body.alertes.map((a: { code: string }) => a.code)).toEqual(
        expect.arrayContaining([
          'TELEPHONE_FICHE_DIFFERENT',
          'EMAIL_FICHE_DIFFERENT',
        ]),
      );
      expect(
        (
          await prisma.teacherSubmission.findUniqueOrThrow({
            where: { id: sub.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
      expect(
        await prisma.user.count({ where: { telephoneCle: '060000001' } }),
      ).toBe(0);
      await validate(sub.id, { teacherId: fiche.id, confirmer: true }).expect(
        201,
      );
      expect(
        (await prisma.teacher.findUniqueOrThrow({ where: { id: fiche.id } }))
          .telephone,
      ).toBe('+242 06 000 0001');

      // Créer une fiche quand une fiche au nom très proche existe : confirmation demandée.
      await teacher('OSSELE', 'Pauline');
      const sub2 = await submitted({
        nom: 'Ossele',
        prenom: 'Pauline',
        telephone: '06 000 4004',
        email: undefined,
      });
      const r2 = await validate(sub2.id, { creerFiche: true }).expect(409);
      expect(r2.body.alertes.map((a: { code: string }) => a.code)).toContain(
        'FICHE_PROCHE_EXISTE',
      );
      await validate(sub2.id, { creerFiche: true, confirmer: true }).expect(
        201,
      );
    });

    it('un e-mail déjà pris : le compte est créé avec le seul numéro, sans voler l’e-mail d’un autre compte', async () => {
      const sub = await submitted({
        email: 'admin@shakespeareacademy.cg',
        telephone: '06 000 4004',
        nom: 'Zebaze',
        prenom: 'Armand',
      });
      await validate(sub.id, { creerFiche: true }).expect(409);
      const ok = await validate(sub.id, {
        creerFiche: true,
        confirmer: true,
      }).expect(201);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: ok.body.userId },
      });
      expect(user.email).toBeNull();
      expect(user.telephoneCle).toBe('060004004');
      expect(
        await prisma.user.count({
          where: { email: 'admin@shakespeareacademy.cg' },
        }),
      ).toBe(1);
    });

    it('refuse sans rien créer : numéro déjà celui d’un compte, fiche déjà reliée, fiche inactive', async () => {
      const school = await prisma.school.findFirstOrThrow();
      const role = await prisma.role.findUniqueOrThrow({
        where: { code: 'ENSEIGNANT' },
      });
      const holder = await prisma.user.create({
        data: {
          schoolId: school.id,
          roleId: role.id,
          nom: 'A',
          prenom: 'B',
          telephone: '06 000 0001',
          telephoneCle: '060000001',
          motDePasseHash: 'x',
        },
      });
      const fiche = await teacher('KIMPOLO', 'Régina');
      const sub = await submitted();
      // Même avec confirmation : un numéro ne sert qu'à un compte.
      await validate(sub.id, { teacherId: fiche.id, confirmer: true }).expect(
        409,
      );
      await validate(sub.id, { creerFiche: true, confirmer: true }).expect(409);
      await prisma.user.delete({ where: { id: holder.id } });

      const other = await prisma.user.create({
        data: {
          schoolId: school.id,
          roleId: role.id,
          nom: 'C',
          prenom: 'D',
          telephone: '06 000 8888',
          telephoneCle: '060008888',
          motDePasseHash: 'x',
        },
      });
      await prisma.teacher.update({
        where: { id: fiche.id },
        data: { userId: other.id },
      });
      await validate(sub.id, { teacherId: fiche.id, confirmer: true }).expect(
        409,
      );
      await prisma.teacher.update({
        where: { id: fiche.id },
        data: { userId: null, statut: 'INACTIF' },
      });
      await validate(sub.id, { teacherId: fiche.id, confirmer: true }).expect(
        409,
      );

      expect(
        (
          await prisma.teacherSubmission.findUniqueOrThrow({
            where: { id: sub.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
      expect(
        await prisma.user.count({ where: { telephoneCle: '060000001' } }),
      ).toBe(0);
    });

    it('deux validations simultanées ne créent qu’un seul compte', async () => {
      const fiche = await teacher('KIMPOLO', 'Régina');
      const sub = await submitted({ email: undefined });
      const results = await Promise.all([
        validate(sub.id, { teacherId: fiche.id, confirmer: true }),
        validate(sub.id, { teacherId: fiche.id, confirmer: true }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        await prisma.user.count({ where: { telephoneCle: '060000001' } }),
      ).toBe(1);
    });

    it('le rôle Enseignant ne doit jamais porter un droit réservé que le valideur n’a pas', async () => {
      const role = await prisma.role.findUniqueOrThrow({
        where: { code: 'ENSEIGNANT' },
      });
      const reserved = await prisma.permission.findUniqueOrThrow({
        where: { code: 'PILOTAGE_READ' },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: reserved.id },
      });
      const sub = await submitted();
      await validate(sub.id, { creerFiche: true, confirmer: true }).expect(403);
      expect(
        (
          await prisma.teacherSubmission.findUniqueOrThrow({
            where: { id: sub.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
      expect(await prisma.teacher.count()).toBe(0);
    });
  });

  describe('refus', () => {
    it('exige un motif, efface le mot de passe et la photo, et ferme la porte', async () => {
      const sub = await submitted({}, await png());
      const file = join(photoDir, sub.photoFichier!);
      expect(existsSync(file)).toBe(true);
      const refuse = (motif: string) =>
        asSecretary(
          request(app.getHttpServer()).post(
            `/teacher-onboarding/submissions/${sub.id}/refuser`,
          ),
        ).send({ motif });
      await refuse('').expect(400);
      await refuse('ok').expect(400);
      await refuse('Pas un enseignant de l’école').expect(201);

      const stored = await prisma.teacherSubmission.findUniqueOrThrow({
        where: { id: sub.id },
      });
      expect(stored.statut).toBe('REFUSEE');
      expect(stored.motifRefus).toBe('Pas un enseignant de l’école');
      expect(stored.motDePasseHash).toBeNull();
      expect(stored.photoFichier).toBeNull();
      expect(existsSync(file)).toBe(false);

      await refuse('Encore une fois').expect(409);
      await validate(sub.id, { creerFiche: true }).expect(409);
      // Plus de message « en cours de vérification » : la demande n'existe plus.
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ identifiant: '060000001', motDePasse: PASSWORD })
        .expect(401);
      expect(res.body.message).not.toContain('vérification');

      const done = (
        await asSecretary(
          request(app.getHttpServer()).get(
            '/teacher-onboarding/submissions?statut=TRAITEES',
          ),
        ).expect(200)
      ).body;
      expect(done[0]).toMatchObject({
        statut: 'REFUSEE',
        motifRefus: 'Pas un enseignant de l’école',
      });
      // Après un refus, l'enseignant peut renvoyer une demande avec le même numéro.
      await send(payload()).expect(201);
    });
  });
});

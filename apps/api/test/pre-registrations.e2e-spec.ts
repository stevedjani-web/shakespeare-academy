import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';

/**
 * Lot 21 : préinscription en ligne. Une famille dépose une demande publique (sans compte) qui porte UN parent ou tuteur
 * et un ou plusieurs enfants (classe demandée, nouvel élève ou ancien élève, documents propres à chacun). Le
 * secrétariat examine chaque enfant à part : il l'accepte (conversion réelle en élève + inscription, D33 et RG01
 * s'appliquent) ou le refuse avec un motif. Le suivi public exige la référence ET le téléphone (la référence seule est
 * séquentielle, donc devinable).
 */
describe('Préinscription en ligne (e2e, Lot 21)', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  const filesDir = join(process.cwd(), 'private-uploads', 'preinscriptions');

  beforeAll(async () => {
    process.env.PREINSCRIPTION_LIMITE_PAR_HEURE = '1000';
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    process.env.PREINSCRIPTION_LIMITE_PAR_HEURE = '1000';
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    admin = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
  });

  afterAll(async () => {
    delete process.env.PREINSCRIPTION_LIMITE_PAR_HEURE;
    await app.close();
  });

  async function login(email: string, motDePasse: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, motDePasse })
      .expect(201);
    return res.body.accessToken;
  }
  const get = (path: string, t = admin) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const post = (path: string, t = admin, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const publicGet = (path: string) => request(app.getHttpServer()).get(path);
  const publicPost = (body: object) =>
    request(app.getHttpServer()).post('/preinscriptions').send(body);

  const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('faux contenu png'),
  ]);
  const JPEG = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from('faux contenu jpeg'),
  ]);

  /** Dépôt multipart : le JSON dans `payload`, un fichier `bulletin_<rang>` par enfant qui joint son bulletin. */
  function multipart(
    body: object,
    files: Array<{ index: number; data: Buffer; name?: string; type?: string }>,
  ) {
    let req = request(app.getHttpServer())
      .post('/preinscriptions')
      .field('payload', JSON.stringify(body));
    for (const f of files) {
      req = req.attach(`bulletin_${f.index}`, f.data, {
        filename: f.name ?? 'bulletin.pdf',
        contentType: f.type ?? 'application/pdf',
      });
    }
    return req;
  }

  async function tokenFor(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      sch.id,
      roleCode,
      { email },
    );
    return login(user.email, motDePasse);
  }

  /**
   * Section, cycle, deux niveaux (CM2 et CP) avec une classe chacun dans l'année active ; une classe d'une année
   * clôturée.
   */
  async function world() {
    const section = (
      await post('/sections', admin, { code: 'FR', nom: 'Francophone' })
    ).body;
    const cycle = (
      await post('/cycles', admin, {
        sectionId: section.id,
        code: 'PRIM',
        nom: 'Primaire',
      })
    ).body;
    const level = (
      await post('/levels', admin, {
        cycleId: cycle.id,
        code: 'CM2',
        nom: 'CM2',
      })
    ).body;
    const level2 = (
      await post('/levels', admin, {
        cycleId: cycle.id,
        code: 'CP',
        nom: 'CP',
      })
    ).body;
    const year = (
      await post('/academic-years', admin, {
        libelle: '2026-2027',
        dateDebut: '2026-09-01',
        dateFin: '2027-06-30',
      })
    ).body;
    await post(`/academic-years/${year.id}/activate`, admin).expect(201);
    const klass = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 A',
      })
    ).body;
    const klass2 = (
      await post('/classes', admin, {
        levelId: level2.id,
        academicYearId: year.id,
        nom: 'CP A',
      })
    ).body;

    const oldYear = (
      await post('/academic-years', admin, {
        libelle: '2024-2025',
        dateDebut: '2024-09-01',
        dateFin: '2025-06-30',
      })
    ).body;
    await prisma.academicYear.update({
      where: { id: oldYear.id },
      data: { statut: 'CLOTUREE' },
    });
    const oldKlass = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: oldYear.id,
        nom: 'Ancienne',
      })
    ).body;

    return {
      section,
      cycle,
      level,
      level2,
      year,
      klass,
      klass2,
      oldYear,
      oldKlass,
    };
  }
  type World = Awaited<ReturnType<typeof world>>;

  const parent = {
    nom: 'Moukala',
    prenom: 'Parent',
    telephone: '242060000001',
  };
  const enfant = (levelId: string, over: object = {}) => ({
    nom: 'Moukala',
    prenom: 'Alice',
    sexe: 'F',
    dateNaissance: '2018-04-12',
    levelId,
    typeEleve: 'NOUVEAU',
    ...over,
  });
  const demande = (enfants: object[], over: object = {}) => ({
    responsable: parent,
    enfants,
    ...over,
  });

  /** Une demande de trois enfants aux profils différents : classe, statut et documents propres à chacun. */
  function famille(w: World) {
    return demande([
      enfant(w.level.id, {
        prenom: 'Alice',
        typeEleve: 'NOUVEAU',
        ancienEtablissement: 'École Les Palmiers',
      }),
      enfant(w.level2.id, {
        prenom: 'Brice',
        dateNaissance: '2020-02-02',
        sexe: 'M',
        typeEleve: 'ANCIEN',
        classePrecedenteLevelId: w.level2.id,
      }),
      enfant(w.level.id, {
        prenom: 'Chloé',
        dateNaissance: '2016-09-09',
        typeEleve: 'NOUVEAU',
      }),
    ]);
  }

  async function demandeOf(reference: string) {
    return prisma.preRegistration.findUniqueOrThrow({
      where: { reference },
      include: { enfants: { orderBy: { ordre: 'asc' } } },
    });
  }

  // ------------------------------------------------------------------ public : niveaux et dépôt

  describe('formulaire public', () => {
    it('l’arbre des niveaux ne montre que id et nom, jamais un effectif ni un tarif', async () => {
      const w = await world();
      const tree = (await publicGet('/preinscriptions/niveaux').expect(200))
        .body as Array<{
        sectionId: string;
        sectionNom: string;
        cycles: Array<{
          cycleId: string;
          cycleNom: string;
          levels: Array<{ id: string; nom: string }>;
        }>;
      }>;
      expect(tree).toHaveLength(1);
      expect(tree[0]).toMatchObject({
        sectionId: w.section.id,
        sectionNom: 'Francophone',
      });
      expect(tree[0].cycles[0].levels).toEqual([
        { id: w.level.id, nom: 'CM2' },
        { id: w.level2.id, nom: 'CP' },
      ]);
      const text = JSON.stringify(tree);
      expect(text).not.toContain('capacite');
      expect(text).not.toContain('montant');
    });

    it('valide le parent, chaque enfant et le choix nouvel élève / ancien élève, en nommant la fiche en cause', async () => {
      const w = await world();
      const bad = (over: object) =>
        publicPost(demande([enfant(w.level.id, over)]));
      await bad({ nom: '' }).expect(400);
      await bad({ sexe: 'X' }).expect(400);
      await bad({ dateNaissance: '12-04-2018' }).expect(400);
      await bad({ dateNaissance: '2099-01-01' }).expect(400);
      await bad({ levelId: 'inconnu' }).expect(400);
      // Le choix nouvel / ancien élève est obligatoire, et il n'a que deux valeurs.
      await bad({ typeEleve: undefined }).expect(400);
      await bad({ typeEleve: 'AUTRE' }).expect(400);
      // Ancien élève : la classe de l'année précédente est obligatoire, et doit exister.
      await bad({ typeEleve: 'ANCIEN' }).expect(400);
      await bad({
        typeEleve: 'ANCIEN',
        classePrecedenteLevelId: 'inconnu',
      }).expect(400);

      const parentBad = (over: object) =>
        publicPost({
          responsable: { ...parent, ...over },
          enfants: [enfant(w.level.id)],
        });
      await parentBad({ telephone: '1' }).expect(400);
      await parentBad({ email: 'pas-un-email' }).expect(400);
      await parentBad({ nom: '' }).expect(400);
      await publicPost({ enfants: [enfant(w.level.id)] }).expect(400);

      // Le message nomme la fiche : ici le deuxième enfant.
      const two = await publicPost(
        demande([
          enfant(w.level.id),
          enfant(w.level.id, { prenom: 'Brice', typeEleve: undefined }),
        ]),
      ).expect(400);
      expect(JSON.stringify(two.body.message)).toContain('Enfant 2 :');
      expect(JSON.stringify(two.body.message)).toContain('nouvel élève');
      const p = await publicPost({
        responsable: { ...parent, nom: '' },
        enfants: [enfant(w.level.id)],
      }).expect(400);
      expect(JSON.stringify(p.body.message)).toContain('Parent / Tuteur :');

      expect(await prisma.preRegistration.count()).toBe(0);
    });

    it('répond dans la langue choisie par la famille (Accept-Language), en français par défaut', async () => {
      const w = await world();
      const en = (body: object) =>
        request(app.getHttpServer())
          .post('/preinscriptions')
          .set('Accept-Language', 'en-GB,en;q=0.9')
          .send(body);
      const bad = await en(
        demande([
          enfant(w.level.id),
          enfant(w.level.id, { prenom: 'Brice', typeEleve: undefined }),
        ]),
      ).expect(400);
      expect(JSON.stringify(bad.body.message)).toContain('Child 2:');
      expect(JSON.stringify(bad.body.message)).toContain('new student');
      const twice = await en(
        demande([enfant(w.level.id), enfant(w.level2.id)]),
      ).expect(400);
      expect(twice.body.message).toMatch(/appears twice in the request/);
      await en(demande([enfant(w.level.id)])).expect(201);
      const dup = await en(demande([enfant(w.level.id)])).expect(409);
      expect(dup.body.message).toMatch(/already pending for Alice Moukala/);
      // Sans en-tête, le français.
      const fr = await publicPost(demande([enfant(w.level.id)])).expect(409);
      expect(fr.body.message).toMatch(/déjà en attente/);
      // Le suivi et le refus d'un fichier suivent aussi la langue.
      await request(app.getHttpServer())
        .get('/preinscriptions/suivi?reference=PREINS-2020-999999&telephone=1')
        .set('Accept-Language', 'en')
        .expect(404)
        .expect((r) => expect(r.body.message).toMatch(/No request matches/));
      await request(app.getHttpServer())
        .post('/preinscriptions')
        .set('Accept-Language', 'en')
        .field(
          'payload',
          JSON.stringify(
            demande([
              enfant(w.level2.id, {
                prenom: 'Zoé',
                dateNaissance: '2015-01-01',
              }),
            ]),
          ),
        )
        .attach('bulletin_0', Buffer.from('pas un pdf'), {
          filename: 'b.pdf',
          contentType: 'application/pdf',
        })
        .expect(400)
        .expect((r) => expect(r.body.message).toMatch(/report must be a PDF/));
    });

    it('refuse une demande sans enfant ou avec plus de huit enfants', async () => {
      const w = await world();
      await publicPost(demande([])).expect(400);
      const nine = Array.from({ length: 9 }, (_, i) =>
        enfant(w.level.id, { prenom: `E${i}` }),
      );
      await publicPost(demande(nine)).expect(400);
      const eight = Array.from({ length: 8 }, (_, i) =>
        enfant(w.level.id, { prenom: `E${i}` }),
      );
      const ok = await publicPost(demande(eight)).expect(201);
      expect(ok.body.enfants).toHaveLength(8);
    });

    it('enregistre plusieurs enfants dans une seule demande : parent saisi une fois, une fiche par enfant', async () => {
      const w = await world();
      const res = await publicPost(famille(w)).expect(201);
      expect(res.body.reference).toMatch(/^PREINS-\d{4}-\d{6}$/);
      // Le récapitulatif renvoyé dit exactement ce qui a été enregistré, enfant par enfant.
      expect(res.body.responsable).toEqual({
        prenom: 'Parent',
        nom: 'Moukala',
      });
      expect(res.body.enfants).toEqual([
        {
          prenom: 'Alice',
          nom: 'Moukala',
          classeDemandee: 'CM2',
          typeEleve: 'NOUVEAU',
          classePrecedente: null,
          ancienEtablissement: 'École Les Palmiers',
          bulletinJoint: false,
        },
        {
          prenom: 'Brice',
          nom: 'Moukala',
          classeDemandee: 'CP',
          typeEleve: 'ANCIEN',
          classePrecedente: 'CP',
          ancienEtablissement: null,
          bulletinJoint: false,
        },
        {
          prenom: 'Chloé',
          nom: 'Moukala',
          classeDemandee: 'CM2',
          typeEleve: 'NOUVEAU',
          classePrecedente: null,
          ancienEtablissement: null,
          bulletinJoint: false,
        },
      ]);

      // Une seule demande, un seul parent, trois fiches.
      expect(await prisma.preRegistration.count()).toBe(1);
      const row = await demandeOf(res.body.reference);
      expect(row).toMatchObject({
        responsableNom: 'Moukala',
        responsablePrenom: 'Parent',
        responsableTelephone: '242060000001',
      });
      expect(row.enfants.map((c) => c.prenom)).toEqual([
        'Alice',
        'Brice',
        'Chloé',
      ]);
      expect(row.enfants.map((c) => c.levelId)).toEqual([
        w.level.id,
        w.level2.id,
        w.level.id,
      ]);
      expect(row.enfants.map((c) => c.typeEleve)).toEqual([
        'NOUVEAU',
        'ANCIEN',
        'NOUVEAU',
      ]);
      expect(row.enfants.every((c) => c.statut === 'EN_ATTENTE')).toBe(true);
    });

    it('nouvel élève : ancien établissement et bulletin facultatifs ; ancien élève : classe précédente obligatoire, champs du nouvel élève ignorés', async () => {
      const w = await world();
      // Un nouvel élève sans ancien établissement ni bulletin est accepté.
      await publicPost(demande([enfant(w.level.id)])).expect(201);
      // Champs qui ne concernent pas le statut choisi : ignorés, jamais enregistrés.
      const res = await publicPost(
        demande([
          enfant(w.level.id, {
            prenom: 'Nouveau',
            dateNaissance: '2015-05-05',
            typeEleve: 'NOUVEAU',
            classePrecedenteLevelId: w.level2.id,
          }),
          enfant(w.level.id, {
            prenom: 'Ancien',
            dateNaissance: '2014-04-04',
            typeEleve: 'ANCIEN',
            classePrecedenteLevelId: w.level2.id,
            ancienEtablissement: 'Ne doit pas être gardé',
          }),
        ]),
      ).expect(201);
      const row = await demandeOf(res.body.reference);
      expect(row.enfants[0].classePrecedenteLevelId).toBeNull();
      expect(row.enfants[1].classePrecedenteLevelId).toBe(w.level2.id);
      expect(row.enfants[1].ancienEtablissement).toBeNull();
    });

    it('refuse deux fois le même enfant dans une demande, et un enfant déjà en attente, mais pas après un refus', async () => {
      const w = await world();
      const twice = await publicPost(
        demande([enfant(w.level.id), enfant(w.level2.id)]),
      ).expect(400);
      expect(twice.body.message).toMatch(/figure deux fois/);

      const dto = demande([enfant(w.level.id)]);
      await publicPost(dto).expect(201);
      const dup = await publicPost({
        ...dto,
        message: 'Autre message',
      }).expect(409);
      expect(dup.body.message).toMatch(/déjà en attente pour Alice Moukala/);
      // Un frère dans une nouvelle demande : jamais bloqué. Un doublon parmi plusieurs enfants bloque toute la demande.
      const mixed = await publicPost(
        demande([
          enfant(w.level.id, { prenom: 'Brice', dateNaissance: '2019-01-01' }),
          enfant(w.level.id),
        ]),
      ).expect(409);
      expect(mixed.body.message).toMatch(/Alice Moukala/);
      expect(await prisma.preRegistration.count()).toBe(1);

      const child = await prisma.preRegistrationChild.findFirstOrThrow({
        where: { prenom: 'Alice' },
      });
      await post(`/preinscriptions/enfants/${child.id}/rejeter`, admin, {
        motif: 'Niveau complet cette année',
      }).expect(201);
      await publicPost(dto).expect(201); // reprise autorisée après un refus
    });

    it('n’écrit dans le journal que des identifiants et des comptes, jamais un nom, un message ni un nom de fichier', async () => {
      const w = await world();
      await multipart(
        demande(
          [
            enfant(w.level.id, {
              ancienEtablissement: 'École Secrète',
              lieuNaissance: 'Lieu Privé',
            }),
          ],
          { message: 'Confidentiel : allergies graves' },
        ),
        [{ index: 0, data: PDF, name: 'bulletin-alice-secret.pdf' }],
      ).expect(201);
      const logs = await prisma.auditLog.findMany({
        where: { action: 'PREREGISTRATION_CREATE' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBeNull();
      expect(logs[0].nouvelleValeur).toMatchObject({
        enfants: 1,
        nouveaux: 1,
        anciens: 0,
        bulletins: 1,
      });
      const text = JSON.stringify(logs[0]);
      for (const secret of [
        'allergies',
        'Alice',
        'Moukala',
        'Secrète',
        'Privé',
        'secret.pdf',
        '242060000001',
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it('limite le nombre de dépôts par adresse (429), sans rien enregistrer au-delà', async () => {
      const w = await world();
      process.env.PREINSCRIPTION_LIMITE_PAR_HEURE = '2';
      const from = (prenom: string) =>
        request(app.getHttpServer())
          .post('/preinscriptions')
          .set('X-Forwarded-For', '203.0.113.9')
          .send(
            demande([
              enfant(w.level.id, { prenom, dateNaissance: '2017-07-07' }),
            ]),
          );
      await from('Un').expect(201);
      await from('Deux').expect(201);
      const blocked = await from('Trois').expect(429);
      expect(blocked.body.message).toMatch(/Trop de demandes/);
      expect(await prisma.preRegistration.count()).toBe(2);
      // Une autre adresse n'est pas touchée.
      await request(app.getHttpServer())
        .post('/preinscriptions')
        .set('X-Forwarded-For', '198.51.100.7')
        .send(
          demande([
            enfant(w.level.id, {
              prenom: 'Quatre',
              dateNaissance: '2017-07-07',
            }),
          ]),
        )
        .expect(201);
    });
  });

  // ------------------------------------------------------------------ bulletins

  describe('bulletins joints', () => {
    it('chaque enfant a ses propres documents : un PDF, une image, ou rien', async () => {
      const w = await world();
      const res = await multipart(famille(w), [
        { index: 0, data: PDF, name: 'bulletin-alice.pdf' },
        { index: 2, data: PNG, name: 'photo.png', type: 'image/png' },
      ]).expect(201);
      expect(
        res.body.enfants.map(
          (e: { bulletinJoint: boolean }) => e.bulletinJoint,
        ),
      ).toEqual([true, false, true]);
      const row = await demandeOf(res.body.reference);
      expect(row.enfants[0]).toMatchObject({
        bulletinNom: 'bulletin-alice.pdf',
        bulletinType: 'application/pdf',
        bulletinTaille: PDF.length,
      });
      expect(row.enfants[1].bulletinFichier).toBeNull();
      expect(row.enfants[2]).toMatchObject({
        bulletinNom: 'photo.png',
        bulletinType: 'image/png',
      });
      // Les fichiers existent, hors du dossier public, sous un nom aléatoire (jamais le nom envoyé).
      for (const c of [row.enfants[0], row.enfants[2]]) {
        expect(c.bulletinFichier).toMatch(/^[0-9a-f-]{36}\.(pdf|png)$/);
        expect(existsSync(join(filesDir, c.bulletinFichier as string))).toBe(
          true,
        );
        await request(app.getHttpServer())
          .get(`/uploads/preinscriptions/${c.bulletinFichier}`)
          .expect(404);
      }
    });

    it('accepte un JPEG et reconnaît le type d’après le contenu, pas d’après le nom', async () => {
      const w = await world();
      // Un JPEG envoyé sous le nom « scan.pdf » et un type mensonger : le type enregistré est le vrai.
      const res = await multipart(demande([enfant(w.level.id)]), [
        { index: 0, data: JPEG, name: 'scan.pdf', type: 'application/pdf' },
      ]).expect(201);
      const row = await demandeOf(res.body.reference);
      expect(row.enfants[0].bulletinType).toBe('image/jpeg');
      expect(row.enfants[0].bulletinFichier).toMatch(/\.jpg$/);
    });

    it('refuse un fichier qui n’est ni PDF, ni JPEG, ni PNG (même renommé) et ne laisse aucun fichier ni demande', async () => {
      const w = await world();
      const before = existsSync(filesDir) ? await readdir(filesDir) : [];
      await multipart(demande([enfant(w.level.id)]), [
        {
          index: 0,
          data: Buffer.from('MZ\x90\x00 exécutable'),
          name: 'bulletin.pdf',
        },
      ])
        .expect(400)
        .expect((r) =>
          expect(r.body.message).toMatch(/PDF, un JPEG ou un PNG/),
        );
      // Un premier fichier valable ne reste pas si le suivant est refusé.
      await multipart(
        demande([
          enfant(w.level.id),
          enfant(w.level.id, { prenom: 'Brice', dateNaissance: '2019-01-01' }),
        ]),
        [
          { index: 0, data: PDF },
          {
            index: 1,
            data: Buffer.from('texte simple'),
            name: 'b.png',
            type: 'image/png',
          },
        ],
      ).expect(400);
      const after = existsSync(filesDir) ? await readdir(filesDir) : [];
      expect(after.sort()).toEqual(before.sort());
      expect(await prisma.preRegistration.count()).toBe(0);
    });

    it('refuse un fichier trop lourd (5 Mo), un bulletin pour un ancien élève et un rang inconnu', async () => {
      const w = await world();
      const big = Buffer.concat([
        Buffer.from('%PDF-1.4\n'),
        Buffer.alloc(5 * 1024 * 1024 + 10, 1),
      ]);
      await multipart(demande([enfant(w.level.id)]), [
        { index: 0, data: big },
      ]).expect(413);

      // Ancien élève : aucun bulletin demandé.
      await multipart(
        demande([
          enfant(w.level.id, {
            typeEleve: 'ANCIEN',
            classePrecedenteLevelId: w.level.id,
          }),
        ]),
        [{ index: 0, data: PDF }],
      )
        .expect(400)
        .expect((r) => expect(r.body.message).toMatch(/nouvel élève/));
      await multipart(demande([enfant(w.level.id)]), [
        { index: 3, data: PDF },
      ]).expect(400);
      // Un fichier dont le champ n'est pas « bulletin_<rang> ».
      await request(app.getHttpServer())
        .post('/preinscriptions')
        .field('payload', JSON.stringify(demande([enfant(w.level.id)])))
        .attach('autre', PDF, 'x.pdf')
        .expect(400);
      expect(await prisma.preRegistration.count()).toBe(0);
    });

    it('le personnel habilité lit le bulletin (journalisé) ; les autres profils et les visiteurs non', async () => {
      const w = await world();
      const res = await multipart(famille(w), [
        { index: 0, data: PDF, name: 'bulletin Alice é.pdf' },
      ]).expect(201);
      const row = await demandeOf(res.body.reference);
      const [alice, brice] = row.enfants;

      const file = await get(`/preinscriptions/enfants/${alice.id}/bulletin`)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(file.headers['content-type']).toContain('application/pdf');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(file.headers['cache-control']).toContain('no-store');
      expect(file.headers['content-disposition']).toContain(
        "filename*=UTF-8''bulletin%20Alice%20%C3%A9.pdf",
      );
      expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);

      await get(`/preinscriptions/enfants/${brice.id}/bulletin`).expect(404); // pas de bulletin
      await get('/preinscriptions/enfants/inconnu/bulletin').expect(404);
      await request(app.getHttpServer())
        .get(`/preinscriptions/enfants/${alice.id}/bulletin`)
        .expect(401);
      for (const [role, email] of [
        ['DIRECTION', 'dir@test.local'],
        ['COMPTABLE', 'cpt@test.local'],
        ['SURVEILLANT', 'surv@test.local'],
        ['ENSEIGNANT', 'ens@test.local'],
      ]) {
        const t = await tokenFor(role, email);
        await get(`/preinscriptions/enfants/${alice.id}/bulletin`, t).expect(
          403,
        );
      }
      const secretariat = await tokenFor(
        'SECRETAIRE_CAISSIER',
        'sec@test.local',
      );
      await get(`/preinscriptions/enfants/${alice.id}/bulletin`, secretariat)
        .buffer(true)
        .parse((response, cb) => {
          response.on('data', () => undefined);
          response.on('end', () => cb(null, Buffer.alloc(0)));
        })
        .expect(200);
      // Chaque lecture est journalisée avec l'identifiant de la fiche, sans nom de fichier.
      const reads = await prisma.auditLog.findMany({
        where: { action: 'PREREGISTRATION_BULLETIN_READ' },
      });
      expect(reads).toHaveLength(2);
      expect(reads.every((l) => l.entiteId === alice.id && l.userId)).toBe(
        true,
      );
      expect(JSON.stringify(reads)).not.toContain('Alice');
    });
  });

  // ------------------------------------------------------------------ suivi public

  describe('suivi public', () => {
    it('exige la référence et le téléphone exacts, jamais la référence seule, et liste tous les enfants', async () => {
      const w = await world();
      const { body } = await publicPost(famille(w)).expect(201);
      await publicGet(
        `/preinscriptions/suivi?reference=${body.reference}`,
      ).expect(400); // téléphone manquant
      await publicGet(
        `/preinscriptions/suivi?reference=${body.reference}&telephone=242060099999`,
      ).expect(404);
      await publicGet(
        `/preinscriptions/suivi?reference=PREINS-2020-999999&telephone=242060000001`,
      ).expect(404);
      const ok = (
        await publicGet(
          `/preinscriptions/suivi?reference=${body.reference}&telephone=242060000001`,
        ).expect(200)
      ).body;
      expect(ok.reference).toBe(body.reference);
      expect(ok.enfants).toEqual([
        expect.objectContaining({
          enfant: 'Alice Moukala',
          classeDemandee: 'CM2',
          typeEleve: 'NOUVEAU',
          statut: 'EN_ATTENTE',
          motifRejet: null,
        }),
        expect.objectContaining({
          enfant: 'Brice Moukala',
          classeDemandee: 'CP',
          typeEleve: 'ANCIEN',
          statut: 'EN_ATTENTE',
        }),
        expect.objectContaining({
          enfant: 'Chloé Moukala',
          classeDemandee: 'CM2',
          statut: 'EN_ATTENTE',
        }),
      ]);
    });

    it('chaque enfant a sa réponse : le motif d’un refus n’apparaît que sur l’enfant refusé', async () => {
      const w = await world();
      const { body } = await publicPost(famille(w)).expect(201);
      const row = await demandeOf(body.reference);
      await post(
        `/preinscriptions/enfants/${row.enfants[0].id}/rejeter`,
        admin,
        {
          motif: 'Places déjà complètes',
        },
      ).expect(201);
      await post(
        `/preinscriptions/enfants/${row.enfants[1].id}/accepter`,
        admin,
        {
          classId: w.klass2.id,
        },
      ).expect(201);
      const suivi = (
        await publicGet(
          `/preinscriptions/suivi?reference=${body.reference}&telephone=242060000001`,
        ).expect(200)
      ).body;
      expect(suivi.enfants[0]).toMatchObject({
        statut: 'REJETEE',
        motifRejet: 'Places déjà complètes',
      });
      expect(suivi.enfants[1]).toMatchObject({
        statut: 'ACCEPTEE',
        motifRejet: null,
      });
      expect(suivi.enfants[2]).toMatchObject({
        statut: 'EN_ATTENTE',
        motifRejet: null,
      });
      // Rien d'interne : ni identifiants d'élève, ni coordonnées, ni fichiers.
      const text = JSON.stringify(suivi);
      expect(text).not.toContain('studentId');
      expect(text).not.toContain('242060000001');
      expect(text).not.toContain('bulletin');
    });
  });

  // ------------------------------------------------------------------ droits du personnel

  describe('droits du personnel', () => {
    it('réservé à ENROLLMENT_MANAGE (secrétariat, Administrateur) ; Direction, comptable, surveillant, enseignant refusés', async () => {
      const w = await world();
      const { body } = await publicPost(famille(w)).expect(201);
      const row = await demandeOf(body.reference);
      const child = row.enfants[0];
      const dir = await tokenFor('DIRECTION', 'dir@test.local');
      const cpt = await tokenFor('COMPTABLE', 'cpt@test.local');
      const surv = await tokenFor('SURVEILLANT', 'surv@test.local');
      const ens = await tokenFor('ENSEIGNANT', 'ens@test.local');
      const sec = await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local');
      for (const t of [dir, cpt, surv, ens]) {
        await get('/preinscriptions', t).expect(403);
        await get(`/preinscriptions/${row.id}`, t).expect(403);
        await post(`/preinscriptions/enfants/${child.id}/rejeter`, t, {
          motif: 'x'.repeat(5),
        }).expect(403);
        await post(`/preinscriptions/enfants/${child.id}/accepter`, t, {
          classId: w.klass.id,
        }).expect(403);
      }
      expect(
        (
          await prisma.preRegistrationChild.findUniqueOrThrow({
            where: { id: child.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
      await get('/preinscriptions', sec).expect(200);
      await request(app.getHttpServer()).get('/preinscriptions').expect(401);
      await request(app.getHttpServer())
        .post(`/preinscriptions/enfants/${child.id}/accepter`)
        .send({ classId: w.klass.id })
        .expect(401);
    });
  });

  // ------------------------------------------------------------------ accepter / refuser un enfant

  describe('examen enfant par enfant', () => {
    it('accepter un nouvel élève crée l’élève et une inscription (D33, matricule, facture) ; un ancien élève, une réinscription', async () => {
      const w = await world();
      const { body } = await publicPost(
        demande([
          enfant(w.level.id, { lieuNaissance: 'Pointe-Noire' }),
          enfant(w.level2.id, {
            prenom: 'Brice',
            dateNaissance: '2020-02-02',
            typeEleve: 'ANCIEN',
            classePrecedenteLevelId: w.level2.id,
          }),
        ]),
      ).expect(201);
      const row = await demandeOf(body.reference);

      const afterAlice = (
        await post(
          `/preinscriptions/enfants/${row.enfants[0].id}/accepter`,
          admin,
          {
            classId: w.klass.id,
          },
        ).expect(201)
      ).body;
      // Un enfant traité, l'autre non : la demande reste à traiter et le dit.
      expect(afterAlice.statut).toBe('EN_ATTENTE');
      expect(afterAlice.compte).toEqual({
        enfants: 2,
        enAttente: 1,
        acceptes: 1,
        refuses: 0,
      });
      const alice = afterAlice.enfants[0];
      expect(alice.statut).toBe('ACCEPTEE');
      expect(alice.studentId).toBeTruthy();
      const student = await prisma.student.findUniqueOrThrow({
        where: { id: alice.studentId },
      });
      expect(student).toMatchObject({
        nom: 'Moukala',
        prenom: 'Alice',
        lieuNaissance: 'Pointe-Noire',
      });
      expect(student.matricule).toMatch(/^\d{6}$/);
      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { id: alice.enrollmentId },
      });
      expect(enrollment).toMatchObject({
        classId: w.klass.id,
        academicYearId: w.year.id,
        type: 'INSCRIPTION',
        statut: 'ACTIVE',
      });
      expect(
        await prisma.invoice.findUnique({
          where: { enrollmentId: enrollment.id },
        }),
      ).not.toBeNull();

      const afterBrice = (
        await post(
          `/preinscriptions/enfants/${row.enfants[1].id}/accepter`,
          admin,
          {
            classId: w.klass2.id,
          },
        ).expect(201)
      ).body;
      // Tous les enfants sont traités : la demande passe à « traitée ».
      expect(afterBrice.statut).toBe('TRAITEE');
      const bricEnrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { id: afterBrice.enfants[1].enrollmentId },
      });
      expect(bricEnrollment.type).toBe('REINSCRIPTION'); // ancien élève, même sans historique dans l'outil

      // Les deux enfants partagent le même responsable (rapprochement par téléphone).
      expect(
        await prisma.guardian.count({ where: { telephone: '242060000001' } }),
      ).toBe(1);
      const guardian = await prisma.guardian.findFirstOrThrow({
        where: { telephone: '242060000001' },
      });
      expect(
        await prisma.studentGuardian.count({
          where: { guardianId: guardian.id },
        }),
      ).toBe(2);
    });

    it('un ancien élève dont le dossier est retrouvé n’est pas recréé : seule son inscription est ajoutée', async () => {
      const w = await world();
      const known = (
        await post('/students', admin, {
          nom: 'Moukala',
          prenom: 'Brice',
          sexe: 'M',
          dateNaissance: '2020-02-02',
        }).expect(201)
      ).body;
      const { body } = await publicPost(
        demande([
          enfant(w.level2.id, {
            prenom: 'Brice',
            sexe: 'M',
            dateNaissance: '2020-02-02',
            typeEleve: 'ANCIEN',
            classePrecedenteLevelId: w.level2.id,
          }),
        ]),
      ).expect(201);
      const row = await demandeOf(body.reference);
      // Sans dossier lié, le doublon (D33) est signalé.
      await post(
        `/preinscriptions/enfants/${row.enfants[0].id}/accepter`,
        admin,
        {
          classId: w.klass2.id,
        },
      ).expect(409);
      await post(
        `/preinscriptions/enfants/${row.enfants[0].id}/accepter`,
        admin,
        {
          classId: w.klass2.id,
          studentId: 'inconnu',
        },
      ).expect(404);
      const done = (
        await post(
          `/preinscriptions/enfants/${row.enfants[0].id}/accepter`,
          admin,
          {
            classId: w.klass2.id,
            studentId: known.id,
          },
        ).expect(201)
      ).body;
      expect(done.enfants[0].studentId).toBe(known.id);
      expect(await prisma.student.count({ where: { prenom: 'Brice' } })).toBe(
        1,
      );
      expect(
        await prisma.enrollment.count({
          where: { studentId: known.id, classId: w.klass2.id },
        }),
      ).toBe(1);
    });

    it('un doublon (D33) refuse d’accepter sans confirmation, puis l’accepte avec forcerCreation', async () => {
      const w = await world();
      await post('/students', admin, {
        nom: 'Moukala',
        prenom: 'Alice',
        sexe: 'F',
        dateNaissance: '2018-04-12',
      }).expect(201);
      const { body } = await publicPost(demande([enfant(w.level.id)])).expect(
        201,
      );
      const child = (await demandeOf(body.reference)).enfants[0];
      const dup = await post(
        `/preinscriptions/enfants/${child.id}/accepter`,
        admin,
        {
          classId: w.klass.id,
        },
      ).expect(409);
      expect(dup.body.doublonPotentiel).toBeTruthy();
      expect(
        (
          await prisma.preRegistrationChild.findUniqueOrThrow({
            where: { id: child.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
      await post(`/preinscriptions/enfants/${child.id}/accepter`, admin, {
        classId: w.klass.id,
        forcerCreation: true,
      }).expect(201);
      expect(
        await prisma.student.count({
          where: { nom: 'Moukala', prenom: 'Alice' },
        }),
      ).toBe(2);
    });

    it('refuse d’accepter dans une classe d’une année clôturée (RG01 hérité) ou inconnue', async () => {
      const w = await world();
      const { body } = await publicPost(demande([enfant(w.level.id)])).expect(
        201,
      );
      const child = (await demandeOf(body.reference)).enfants[0];
      await post(`/preinscriptions/enfants/${child.id}/accepter`, admin, {
        classId: w.oldKlass.id,
      }).expect(409);
      expect(
        (
          await prisma.preRegistrationChild.findUniqueOrThrow({
            where: { id: child.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
      await post(`/preinscriptions/enfants/${child.id}/accepter`, admin, {
        classId: 'inconnue',
      }).expect(404);
    });

    it('refuser exige un motif, et ni accepter ni refuser deux fois le même enfant', async () => {
      const w = await world();
      const { body } = await publicPost(
        demande([
          enfant(w.level.id),
          enfant(w.level.id, { prenom: 'Brice', dateNaissance: '2019-01-01' }),
        ]),
      ).expect(201);
      const [a, b] = (await demandeOf(body.reference)).enfants;
      await post(`/preinscriptions/enfants/${a.id}/rejeter`, admin, {
        motif: 'x',
      }).expect(400);
      const refused = (
        await post(`/preinscriptions/enfants/${a.id}/rejeter`, admin, {
          motif: 'Aucune place disponible',
        }).expect(201)
      ).body;
      expect(refused.compte).toMatchObject({ enAttente: 1, refuses: 1 });
      await post(`/preinscriptions/enfants/${a.id}/rejeter`, admin, {
        motif: 'Encore',
      }).expect(409);
      await post(`/preinscriptions/enfants/${a.id}/accepter`, admin, {
        classId: w.klass.id,
      }).expect(409);
      // L'autre enfant de la même demande reste à traiter, indépendamment du premier.
      await post(`/preinscriptions/enfants/${b.id}/accepter`, admin, {
        classId: w.klass.id,
      }).expect(201);
      await post(`/preinscriptions/enfants/${b.id}/accepter`, admin, {
        classId: w.klass.id,
      }).expect(409);
      await post(`/preinscriptions/enfants/${b.id}/rejeter`, admin, {
        motif: 'Trop tard désormais',
      }).expect(409);
    });

    it('la liste montre chaque demande avec tous ses enfants ; « en attente » = au moins un enfant à traiter', async () => {
      const w = await world();
      const one = await publicPost(famille(w)).expect(201);
      await publicPost(
        demande(
          [enfant(w.level.id, { prenom: 'Seul', dateNaissance: '2013-03-03' })],
          {
            responsable: { ...parent, telephone: '242060000002' },
          },
        ),
      ).expect(201);

      const all = (await get('/preinscriptions').expect(200)).body;
      expect(all).toHaveLength(2);
      const famille3 = all.find(
        (r: { reference: string }) => r.reference === one.body.reference,
      );
      expect(famille3.enfants).toHaveLength(3);
      expect(famille3.compte).toEqual({
        enfants: 3,
        enAttente: 3,
        acceptes: 0,
        refuses: 0,
      });
      expect(famille3.responsable).toMatchObject({
        nom: 'Moukala',
        telephone: '242060000001',
      });
      expect(famille3.enfants[1]).toMatchObject({
        typeEleve: 'ANCIEN',
        niveau: { id: w.level2.id, nom: 'CP' },
        classePrecedente: { id: w.level2.id, nom: 'CP' },
      });

      // Deux enfants traités sur trois : la demande reste « en attente » ; le dernier traité, elle passe « traitée ».
      const row = await demandeOf(one.body.reference);
      await post(
        `/preinscriptions/enfants/${row.enfants[0].id}/rejeter`,
        admin,
        {
          motif: 'Niveau complet',
        },
      ).expect(201);
      await post(
        `/preinscriptions/enfants/${row.enfants[1].id}/rejeter`,
        admin,
        {
          motif: 'Niveau complet',
        },
      ).expect(201);
      expect(
        (await get('/preinscriptions?statut=EN_ATTENTE').expect(200)).body,
      ).toHaveLength(2);
      expect(
        (await get('/preinscriptions?statut=TRAITEE').expect(200)).body,
      ).toHaveLength(0);
      await post(
        `/preinscriptions/enfants/${row.enfants[2].id}/rejeter`,
        admin,
        {
          motif: 'Niveau complet',
        },
      ).expect(201);
      expect(
        (await get('/preinscriptions?statut=EN_ATTENTE').expect(200)).body,
      ).toHaveLength(1);
      const done = (await get('/preinscriptions?statut=TRAITEE').expect(200))
        .body;
      expect(done).toHaveLength(1);
      expect(done[0].reference).toBe(one.body.reference);
      await get('/preinscriptions?statut=ACCEPTEE').expect(400);
      expect(
        (await get(`/preinscriptions/${row.id}`).expect(200)).body.enfants,
      ).toHaveLength(3);
      await get('/preinscriptions/inconnue').expect(404);
    });

    it('le détail d’un enfant expose ses informations propres : statut, ancien établissement, bulletin', async () => {
      const w = await world();
      const { body } = await multipart(famille(w), [
        { index: 0, data: PDF, name: 'bulletin.pdf' },
      ]).expect(201);
      const detail = (
        await get(
          `/preinscriptions/${(await demandeOf(body.reference)).id}`,
        ).expect(200)
      ).body;
      expect(detail.enfants[0]).toMatchObject({
        typeEleve: 'NOUVEAU',
        ancienEtablissement: 'École Les Palmiers',
        classePrecedente: null,
        bulletin: {
          nom: 'bulletin.pdf',
          type: 'application/pdf',
          taille: PDF.length,
        },
      });
      expect(detail.enfants[1]).toMatchObject({
        typeEleve: 'ANCIEN',
        bulletin: null,
      });
      // Le nom de fichier stocké sur le disque ne sort jamais dans l'API.
      expect(JSON.stringify(detail)).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf/,
      );
    });
  });

  // ------------------------------------------------------------------ droits réutilisés

  it('les droits réutilisés (ENROLLMENT_MANAGE) restent ceux déjà en place, aucun nouveau droit ajouté', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { permission: { code: 'ENROLLMENT_MANAGE' } },
      include: { role: true },
    });
    expect(rows.map((r) => r.role.code).sort()).toEqual([
      'ADMINISTRATEUR',
      'SECRETAIRE_CAISSIER',
    ]);
    expect(
      await prisma.permission.count({
        where: { code: { startsWith: 'PREINSCRIPTION' } },
      }),
    ).toBe(0);
  });
});

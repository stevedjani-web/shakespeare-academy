import { existsSync, readdirSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays } from '../src/timetable/timetable.util';
import { CLASS_CARDS_MAX } from '../src/documents/documents.service';
import { STUDENT_PHOTO_DIR } from '../src/students/student-photo.storage';
import { CONSENT_VERSION } from '../src/parent-portal/parent-auth.util';

/**
 * Lot 19 : documents officiels. Attestation de scolarité et carte d'élève, numéro séquentiel, jeton aléatoire dans le
 * QR code, contenu figé, émission idempotente, vérification publique sans donnée en trop, photo jamais servie en public.
 */
describe('Documents officiels (e2e, Lot 19)', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  const createdFiles: string[] = [];

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const year = new Date().getFullYear();

  // Un PNG valide de 1 pixel.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    admin = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
  });

  afterEach(() => {
    for (const f of createdFiles.splice(0)) if (existsSync(f)) unlinkSync(f);
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string, motDePasse: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, motDePasse }).expect(201);
    return res.body.accessToken;
  }
  const get = (path: string, t = admin) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const post = (path: string, t = admin, body: object = {}) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${t}`).send(body);
  const patch = (path: string, t: string, body: object) =>
    request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${t}`).send(body);
  const portalPost = (path: string, t: string, body: object = {}) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${t}`).send(body);

  async function tokenFor(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(prisma, sch.id, roleCode, { email });
    return login(user.email, motDePasse);
  }

  const setSigner = () =>
    patch('/school', admin, { directeurNom: 'Marie Ndinga', directeurTitre: 'La Directrice', ville: 'Brazzaville' }).expect(200);

  /** Année active, une classe, Alice et Carine inscrites, Diane sans inscription, Gaby jamais inscrite. */
  async function school() {
    const section = (await post('/sections', admin, { code: 'FR', nom: 'Francophone' })).body;
    const cycle = (await post('/cycles', admin, { sectionId: section.id, code: 'PRIM', nom: 'Primaire' })).body;
    const level = (await post('/levels', admin, { cycleId: cycle.id, code: 'CM2', nom: 'CM2' })).body;
    const yearRow = (
      await post('/academic-years', admin, { libelle: '2026-2027', dateDebut: addDays(today, -120), dateFin: addDays(today, 200) })
    ).body;
    await post(`/academic-years/${yearRow.id}/activate`, admin).expect(201);
    const classA = (await post('/classes', admin, { levelId: level.id, academicYearId: yearRow.id, nom: 'CM2 A' })).body;
    const feeType = (
      await post('/fee-types', admin, { code: 'INSCRIPTION', nom: "Frais d'inscription", obligatoire: true, avecTranches: false })
    ).body;
    await post('/fee-schedules', admin, {
      academicYearId: yearRow.id,
      levelId: level.id,
      feeTypeId: feeType.id,
      montant: 45000,
    }).expect(201);

    const mk = async (nom: string, prenom: string, tel: string, classId?: string, extra: object = {}) => {
      const student = (
        await post('/students', admin, {
          nom,
          prenom,
          sexe: 'F',
          dateNaissance: '2015-04-12',
          lieuNaissance: 'Pointe-Noire',
          responsable: { nom, prenom: 'Parent', telephone: tel, lien: 'Parent' },
          ...extra,
        }).expect(201)
      ).body;
      if (classId) {
        await post('/enrollments', admin, { studentId: student.id, classId, academicYearId: yearRow.id }).expect(201);
      }
      return student as { id: string; matricule: string };
    };
    const alice = await mk('Moukala', 'Alice', '242060000001', classA.id);
    const carine = await mk('Zola', 'Carine', '242060000002', classA.id);
    const diane = await mk('Nzila', 'Diane', '242060000003');
    const guardians = await prisma.guardian.findMany();
    const g = (tel: string) => guardians.find((x) => x.telephone === tel)!;
    return { yearRow, classA, level, alice, carine, diane, moukala: g('242060000001'), zola: g('242060000002'), mk };
  }

  const issue = (studentId: string, body: object, t = admin) => post(`/students/${studentId}/documents`, t, body);
  const ATT = { type: 'ATTESTATION_SCOLARITE' };
  const CARTE = { type: 'CARTE_ELEVE' };

  async function parentToken(guardianId: string, telephone: string) {
    const { body } = await post(`/parent-accounts/guardians/${guardianId}/activation-code`).expect(201);
    const res = await request(app.getHttpServer())
      .post('/portal/activate')
      .send({ telephone, code: body.code, motDePasse: 'MotDePasse123', consentement: true, versionPolitique: CONSENT_VERSION })
      .expect(201);
    return res.body.accessToken as string;
  }

  // ------------------------------------------------------------------ émission

  describe('émission', () => {
    it('refuse une attestation tant que le directeur et la ville ne sont pas renseignés, mais pas une carte', async () => {
      const s = await school();
      const res = await issue(s.alice.id, ATT).expect(422);
      expect(res.body.message).toMatch(/directeur/i);
      await issue(s.alice.id, CARTE).expect(201);
      await setSigner();
      await issue(s.alice.id, ATT).expect(201);
    });

    it('fige le contenu, numérote sans le montrer dans le jeton, et garde le lieu de naissance', async () => {
      const s = await school();
      await setSigner();
      const doc = (await issue(s.alice.id, ATT).expect(201)).body;
      expect(doc.numero).toBe(`ATT-${year}-000001`);
      expect(doc.verificationToken).toBeTruthy();
      expect(doc.verificationToken).not.toContain('000001');
      expect(doc.emisParType).toBe('STAFF');
      expect(doc.snapshot.eleve).toMatchObject({ nom: 'Moukala', prenom: 'Alice', dateNaissance: '2015-04-12', lieuNaissance: 'Pointe-Noire' });
      expect(doc.snapshot.classe).toBe('CM2 A');
      expect(doc.snapshot.annee.libelle).toBe('2026-2027');
      expect(doc.snapshot.directeur).toMatchObject({ nom: 'Marie Ndinga', titre: 'La Directrice', ville: 'Brazzaville' });

      // Le contenu reste celui de l'émission même si l'école change ensuite.
      await patch('/school', admin, { directeurNom: 'Autre Personne' }).expect(200);
      const again = (await issue(s.alice.id, ATT).expect(201)).body;
      expect(again.snapshot.directeur.nom).toBe('Marie Ndinga');
    });

    it('est idempotente : redemander renvoie le même document sans consommer de numéro', async () => {
      const s = await school();
      await setSigner();
      const first = (await issue(s.alice.id, ATT).expect(201)).body;
      const second = (await issue(s.alice.id, ATT).expect(201)).body;
      expect(second.id).toBe(first.id);
      expect(second.numero).toBe(first.numero);
      const carine = (await issue(s.carine.id, ATT).expect(201)).body;
      expect(carine.numero).toBe(`ATT-${year}-000002`); // aucun trou
      expect(await prisma.issuedDocument.count()).toBe(2);
      // Les cartes ont leur propre suite de numéros.
      const card = (await issue(s.alice.id, CARTE).expect(201)).body;
      expect(card.numero).toBe(`CAR-${year}-000001`);
    });

    it('une demande simultanée ne crée qu’un seul document', async () => {
      const s = await school();
      await setSigner();
      const results = await Promise.all([1, 2, 3, 4].map(() => issue(s.carine.id, ATT)));
      for (const r of results) expect(r.status).toBe(201);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await prisma.issuedDocument.count()).toBe(1);
    });

    it('renouveler crée un nouveau numéro et annule l’ancien document', async () => {
      const s = await school();
      const first = (await issue(s.alice.id, CARTE).expect(201)).body;
      const renewed = (await issue(s.alice.id, { ...CARTE, renouveler: true }).expect(201)).body;
      expect(renewed.id).not.toBe(first.id);
      expect(renewed.numero).toBe(`CAR-${year}-000002`);
      const list = (await get(`/students/${s.alice.id}/documents`).expect(200)).body as Array<{ id: string; annuleLe: string | null }>;
      expect(list).toHaveLength(2);
      expect(list.find((d) => d.id === first.id)!.annuleLe).not.toBeNull();
      expect(list.find((d) => d.id === renewed.id)!.annuleLe).toBeNull();
      // Une fois renouvelée, la demande simple renvoie le nouveau.
      expect((await issue(s.alice.id, CARTE).expect(201)).body.id).toBe(renewed.id);
    });

    it('refuse sans inscription active, pour un élève inactif ou inconnu', async () => {
      const s = await school();
      await setSigner();
      const res = await issue(s.diane.id, ATT).expect(422);
      expect(res.body.message).toMatch(/inscription active/i);
      await patch(`/students/${s.alice.id}`, admin, { statut: 'INACTIF' }).expect(200);
      await issue(s.alice.id, ATT).expect(422);
      await issue('inconnu', ATT).expect(404);
      await issue(s.carine.id, { type: 'AUTRE' }).expect(400);
    });

    it('n’écrit dans le journal qu’à la création, pas à la réimpression', async () => {
      const s = await school();
      await issue(s.alice.id, CARTE).expect(201);
      await issue(s.alice.id, CARTE).expect(201);
      expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_ISSUE' } })).toBe(1);
    });
  });

  // ------------------------------------------------------------------ vérification publique

  describe('vérification publique', () => {
    it('ne révèle que ce qui est imprimé, jamais date de naissance, matricule ni responsable', async () => {
      const s = await school();
      await setSigner();
      const doc = (await issue(s.alice.id, ATT).expect(201)).body;
      const res = await request(app.getHttpServer()).get(`/documents/verify/${doc.verificationToken}`).expect(200);
      expect(Object.keys(res.body).sort()).toEqual(['annee', 'classe', 'dateEmission', 'eleve', 'etablissement', 'numero', 'statut', 'type']);
      expect(res.body).toMatchObject({ statut: 'VALIDE', numero: doc.numero, classe: 'CM2 A', annee: '2026-2027' });
      expect(Object.keys(res.body.eleve).sort()).toEqual(['nom', 'prenom']);
      const text = JSON.stringify({ ...res.body, numero: undefined }); // le matricule et le numéro peuvent se ressembler
      for (const secret of ['2015', 'Pointe-Noire', s.alice.matricule, 'Parent', '242060000001']) expect(text).not.toContain(secret);
    });

    it('un document annulé est signalé, un jeton inconnu ou un numéro ne donnent rien', async () => {
      const s = await school();
      const dir = await tokenFor('DIRECTION', 'dir@test.local');
      const doc = (await issue(s.alice.id, CARTE).expect(201)).body;
      await post(`/documents/${doc.id}/annuler`, dir, { motif: 'Carte perdue' }).expect(201);
      const res = await request(app.getHttpServer()).get(`/documents/verify/${doc.verificationToken}`).expect(200);
      expect(res.body.statut).toBe('ANNULE');
      await request(app.getHttpServer()).get('/documents/verify/inconnu').expect(404);
      await request(app.getHttpServer()).get(`/documents/verify/${doc.numero}`).expect(404);
    });
  });

  // ------------------------------------------------------------------ droits

  describe('droits', () => {
    it('le secrétariat, la Direction et l’Administrateur émettent ; les autres non', async () => {
      const s = await school();
      await setSigner();
      const sec = await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local');
      const dir = await tokenFor('DIRECTION', 'dir@test.local');
      const cpt = await tokenFor('COMPTABLE', 'cpt@test.local');
      const surv = await tokenFor('SURVEILLANT', 'surv@test.local');
      const ens = await tokenFor('ENSEIGNANT', 'ens@test.local');
      await request(app.getHttpServer()).post(`/students/${s.alice.id}/documents`).send(ATT).expect(401);
      await issue(s.alice.id, ATT, sec).expect(201);
      await issue(s.alice.id, ATT, dir).expect(201);
      await issue(s.alice.id, ATT, admin).expect(201);
      for (const t of [cpt, surv, ens]) {
        await issue(s.alice.id, ATT, t).expect(403);
        await get(`/students/${s.alice.id}/documents`, t).expect(403);
      }
    });

    it('seule la Direction annule, avec un motif, et une seule fois', async () => {
      const s = await school();
      const sec = await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local');
      const dir = await tokenFor('DIRECTION', 'dir@test.local');
      const doc = (await issue(s.alice.id, CARTE).expect(201)).body;
      await post(`/documents/${doc.id}/annuler`, sec, { motif: 'Erreur de saisie' }).expect(403);
      await post(`/documents/${doc.id}/annuler`, admin, { motif: 'Erreur de saisie' }).expect(403); // droit réservé
      await post(`/documents/${doc.id}/annuler`, dir, { motif: 'x' }).expect(400);
      const done = (await post(`/documents/${doc.id}/annuler`, dir, { motif: 'Erreur de saisie' }).expect(201)).body;
      expect(done.annuleLe).not.toBeNull();
      expect(done.motifAnnulation).toBe('Erreur de saisie');
      await post(`/documents/${doc.id}/annuler`, dir, { motif: 'Encore' }).expect(409);
      await post('/documents/inconnu/annuler', dir, { motif: 'Erreur de saisie' }).expect(404);
      expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_CANCEL' } })).toBe(1);
    });

    it('les droits sont bien attribués par la migration et le seed', async () => {
      const rows = await prisma.rolePermission.findMany({
        where: { permission: { code: { in: ['DOCUMENT_ISSUE', 'DOCUMENT_CANCEL'] } } },
        include: { role: true, permission: true },
      });
      const by = (code: string) => rows.filter((r) => r.permission.code === code).map((r) => r.role.code).sort();
      expect(by('DOCUMENT_ISSUE')).toEqual(['ADMINISTRATEUR', 'DIRECTION', 'SECRETAIRE_CAISSIER']);
      expect(by('DOCUMENT_CANCEL')).toEqual(['DIRECTION']);
      const sql = readFileSync(join(__dirname, '..', 'prisma', 'migrations', '20260924080000_lot19_documents_officiels', 'migration.sql'), 'utf8');
      expect(sql).toContain('DOCUMENT_ISSUE');
      expect(sql).toContain('DOCUMENT_CANCEL');
      expect(sql).toContain('ON CONFLICT');
    });
  });

  // ------------------------------------------------------------------ portail parent

  describe('portail parent', () => {
    it('le parent obtient l’attestation de son enfant, la même que celle du secrétariat', async () => {
      const s = await school();
      await setSigner();
      const staffDoc = (await issue(s.alice.id, ATT).expect(201)).body;
      const parent = await parentToken(s.moukala.id, '242060000001');
      const doc = (await portalPost(`/portal/children/${s.alice.id}/attestation`, parent).expect(201)).body;
      expect(doc.id).toBe(staffDoc.id);
      expect(doc.snapshot.eleve.prenom).toBe('Alice');

      // Pour un enfant sans document encore émis, le parent l'émet lui-même.
      const parent2 = await parentToken(s.zola.id, '242060000002');
      const mine = (await portalPost(`/portal/children/${s.carine.id}/attestation`, parent2).expect(201)).body;
      expect(mine.emisParType).toBe('PARENT');
      expect(mine.emisParId).toBeUndefined();
      const stored = await prisma.issuedDocument.findUniqueOrThrow({ where: { id: mine.id } });
      expect(stored.emisParId).toBe(s.zola.id);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'DOCUMENT_ISSUE', entiteId: mine.id } });
      expect(audit.userId).toBeNull();
    });

    it('un parent n’accède jamais à l’enfant d’une autre famille, ni à la carte', async () => {
      const s = await school();
      await setSigner();
      const parent = await parentToken(s.moukala.id, '242060000001');
      await portalPost(`/portal/children/${s.carine.id}/attestation`, parent).expect(404);
      await portalPost(`/portal/children/${s.alice.id}/documents`, parent, CARTE).expect(404);
      await request(app.getHttpServer()).post(`/portal/children/${s.alice.id}/attestation`).expect(401);
      // Le jeton d'un membre du personnel n'ouvre pas le portail.
      await portalPost(`/portal/children/${s.alice.id}/attestation`, admin).expect(401);
      expect(await prisma.issuedDocument.count()).toBe(0);
    });

    it('sans directeur renseigné ou sans inscription, le parent reçoit une explication claire', async () => {
      const s = await school();
      const parent = await parentToken(s.moukala.id, '242060000001');
      const res = await portalPost(`/portal/children/${s.alice.id}/attestation`, parent).expect(422);
      expect(res.body.message).toMatch(/secrétariat/i);
      await setSigner();
      await prisma.enrollment.updateMany({ where: { studentId: s.alice.id }, data: { statut: 'ANNULEE' } });
      const res2 = await portalPost(`/portal/children/${s.alice.id}/attestation`, parent).expect(422);
      expect(res2.body.message).toMatch(/inscription active/i);
    });
  });

  // ------------------------------------------------------------------ cartes en lot

  describe('cartes d’une classe', () => {
    it('émet les cartes manquantes, sans dupliquer si on relance', async () => {
      const s = await school();
      await issue(s.alice.id, CARTE).expect(201); // déjà émise
      const first = (await post(`/documents/class-cards/${s.classA.id}`).expect(201)).body;
      expect(first.classe).toBe('CM2 A');
      expect(first.documents).toHaveLength(2);
      expect(first.cartesCreees).toBe(1);
      const second = (await post(`/documents/class-cards/${s.classA.id}`).expect(201)).body;
      expect(second.cartesCreees).toBe(0);
      expect(second.documents.map((d: { id: string }) => d.id).sort()).toEqual(first.documents.map((d: { id: string }) => d.id).sort());
      expect(await prisma.issuedDocument.count()).toBe(2);
    });

    it('refuse une classe inconnue, hors année active, et au-delà du plafond', async () => {
      const s = await school();
      await post('/documents/class-cards/inconnue').expect(404);
      const sec = await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local');
      const cpt = await tokenFor('COMPTABLE', 'cpt@test.local');
      await post(`/documents/class-cards/${s.classA.id}`, cpt).expect(403);
      await post(`/documents/class-cards/${s.classA.id}`, sec).expect(201);

      const sch = await prisma.school.findFirstOrThrow();
      const n = CLASS_CARDS_MAX + 1;
      await prisma.student.createMany({
        data: Array.from({ length: n }, (_, i) => ({
          schoolId: sch.id,
          matricule: `LOT-${i}`,
          nom: `Eleve${i}`,
          prenom: 'Test',
          sexe: 'M' as const,
          dateNaissance: new Date('2014-01-01'),
        })),
      });
      const students = await prisma.student.findMany({ where: { matricule: { startsWith: 'LOT-' } } });
      await prisma.enrollment.createMany({
        data: students.map((st, i) => ({
          schoolId: sch.id,
          studentId: st.id,
          classId: s.classA.id,
          academicYearId: s.yearRow.id,
          numero: `INS-LOT-${i}`,
          type: 'INSCRIPTION' as const,
          statut: 'ACTIVE' as const,
        })),
      });
      const res = await post(`/documents/class-cards/${s.classA.id}`).expect(422);
      expect(res.body.message).toContain(String(CLASS_CARDS_MAX));
      expect(await prisma.issuedDocument.count()).toBe(2); // rien de plus n'a été émis

      await prisma.academicYear.update({ where: { id: s.yearRow.id }, data: { statut: 'CLOTUREE' } });
      await post(`/documents/class-cards/${s.classA.id}`).expect(422);
    });
  });

  // ------------------------------------------------------------------ photo d'élève

  describe('photo d’élève', () => {
    const upload = (studentId: string, t: string, buf: Buffer, filename: string, contentType: string) =>
      request(app.getHttpServer())
        .post(`/students/${studentId}/photo`)
        .set('Authorization', `Bearer ${t}`)
        .attach('file', buf, { filename, contentType });

    it('est stockée hors du dossier public et servie seulement à un utilisateur connecté', async () => {
      const s = await school();
      const res = await upload(s.alice.id, admin, PNG, 'photo.png', 'image/png').expect(201);
      const stored = await prisma.student.findUniqueOrThrow({ where: { id: s.alice.id } });
      expect(stored.photoUrl).toBeTruthy();
      expect(stored.photoUrl).not.toContain('/');
      const file = join(STUDENT_PHOTO_DIR, stored.photoUrl!);
      createdFiles.push(file);
      expect(existsSync(file)).toBe(true);
      expect(res.body.photoUrl).toBe(stored.photoUrl);

      const served = await get(`/students/${s.alice.id}/photo`).expect(200);
      expect(served.headers['content-type']).toContain('image/png');
      expect(served.headers['cache-control']).toContain('no-store');
      expect(Buffer.compare(served.body as Buffer, PNG)).toBe(0);

      await request(app.getHttpServer()).get(`/students/${s.alice.id}/photo`).expect(401);
      // Jamais accessible par le dossier statique public.
      await request(app.getHttpServer()).get(`/uploads/${stored.photoUrl}`).expect(404);
      await request(app.getHttpServer()).get(`/uploads/students/${stored.photoUrl}`).expect(404);
      await request(app.getHttpServer()).get(`/private-uploads/students/${stored.photoUrl}`).expect(404);
    });

    it('refuse un mauvais format ou un fichier trop lourd, sans rien enregistrer', async () => {
      const s = await school();
      await upload(s.alice.id, admin, Buffer.from('GIF89a'), 'a.gif', 'image/gif').expect(400);
      await upload(s.alice.id, admin, Buffer.from('%PDF-1.4'), 'a.pdf', 'application/pdf').expect(400);
      await upload(s.alice.id, admin, Buffer.alloc(2 * 1024 * 1024 + 10, 1), 'big.png', 'image/png').expect(413);
      expect((await prisma.student.findUniqueOrThrow({ where: { id: s.alice.id } })).photoUrl).toBeNull();
      await get(`/students/${s.alice.id}/photo`).expect(404);
    });

    it('remplacer la photo supprime l’ancien fichier ; un élève inconnu ne laisse aucun fichier', async () => {
      const s = await school();
      await upload(s.alice.id, admin, PNG, 'p.png', 'image/png').expect(201);
      const first = (await prisma.student.findUniqueOrThrow({ where: { id: s.alice.id } })).photoUrl!;
      createdFiles.push(join(STUDENT_PHOTO_DIR, first));
      await upload(s.alice.id, admin, PNG, 'p2.png', 'image/png').expect(201);
      const second = (await prisma.student.findUniqueOrThrow({ where: { id: s.alice.id } })).photoUrl!;
      createdFiles.push(join(STUDENT_PHOTO_DIR, second));
      expect(second).not.toBe(first);
      expect(existsSync(join(STUDENT_PHOTO_DIR, first))).toBe(false);
      expect(existsSync(join(STUDENT_PHOTO_DIR, second))).toBe(true);

      const before = readdirSync(STUDENT_PHOTO_DIR).length;
      await upload('inconnu', admin, PNG, 'p3.png', 'image/png').expect(404);
      expect(readdirSync(STUDENT_PHOTO_DIR).length).toBe(before);
    });

    it('seuls ceux qui gèrent les inscriptions téléversent ; le personnel qui lit les dossiers voit la photo', async () => {
      const s = await school();
      const cpt = await tokenFor('COMPTABLE', 'cpt@test.local');
      const sec = await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local');
      await upload(s.alice.id, cpt, PNG, 'p.png', 'image/png').expect(403);
      await upload(s.alice.id, sec, PNG, 'p.png', 'image/png').expect(201);
      const name = (await prisma.student.findUniqueOrThrow({ where: { id: s.alice.id } })).photoUrl!;
      createdFiles.push(join(STUDENT_PHOTO_DIR, name));
      await get(`/students/${s.alice.id}/photo`, cpt).expect(200);
    });
  });

  // ------------------------------------------------------------------ réglages de l'école et lieu de naissance

  describe('réglages et dossier', () => {
    it('la signature se téléverse en PNG ou JPEG, pas autrement, et par ceux qui gèrent les réglages', async () => {
      const upload = (t: string, buf: Buffer, filename: string, contentType: string) =>
        request(app.getHttpServer()).post('/school/signature').set('Authorization', `Bearer ${t}`).attach('file', buf, { filename, contentType });
      const sec = await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local');
      await upload(sec, PNG, 's.png', 'image/png').expect(403);
      await upload(admin, Buffer.from('GIF89a'), 's.gif', 'image/gif').expect(400);
      await upload(admin, Buffer.from('x'), 's.webp', 'image/webp').expect(400);
      await upload(admin, Buffer.alloc(1024 * 1024 + 10, 1), 's.png', 'image/png').expect(413);
      const res = await upload(admin, PNG, 's.png', 'image/png').expect(201);
      expect(res.body.signatureUrl).toMatch(/^\/uploads\/school\/signature-.+\.png$/);
      createdFiles.push(join(process.cwd(), res.body.signatureUrl));
      // Cette image est publique, comme le logo (aucune donnée personnelle).
      await request(app.getHttpServer()).get(res.body.signatureUrl).expect(200);
    });

    it('le nom du directeur, son titre et la ville se règlent, avec des bornes', async () => {
      const res = (await patch('/school', admin, { directeurNom: 'Marie Ndinga', directeurTitre: 'La Directrice', ville: 'Brazzaville' }).expect(200)).body;
      expect(res).toMatchObject({ directeurNom: 'Marie Ndinga', directeurTitre: 'La Directrice', ville: 'Brazzaville' });
      await patch('/school', admin, { ville: 'x'.repeat(81) }).expect(400);
      const sec = await tokenFor('SECRETAIRE_CAISSIER', 'sec@test.local');
      await patch('/school', sec, { ville: 'Pointe-Noire' }).expect(403);
    });

    it('le lieu de naissance est facultatif, modifiable et effaçable', async () => {
      const s = await school();
      const noPlace = (await s.mk('Sans', 'Lieu', '242060000009', undefined, { lieuNaissance: undefined })) as { id: string };
      expect((await get(`/students/${noPlace.id}`).expect(200)).body.lieuNaissance).toBeNull();
      expect((await get(`/students/${s.alice.id}`).expect(200)).body.lieuNaissance).toBe('Pointe-Noire');
      await patch(`/students/${s.alice.id}`, admin, { lieuNaissance: '  Dolisie ' }).expect(200);
      expect((await get(`/students/${s.alice.id}`).expect(200)).body.lieuNaissance).toBe('Dolisie');
      await patch(`/students/${s.alice.id}`, admin, { lieuNaissance: '' }).expect(200);
      expect((await get(`/students/${s.alice.id}`).expect(200)).body.lieuNaissance).toBeNull();
      await patch(`/students/${s.alice.id}`, admin, { lieuNaissance: 'x'.repeat(121) }).expect(400);
    });
  });
});

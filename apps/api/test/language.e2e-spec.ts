import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PUSH_SENDER } from '../src/notifications/push-sender.interface';
import type { FakePushSender } from './utils/fake-push-sender';
import { parseAcceptLanguage } from '../src/common/language';

/**
 * Choix de la langue (français ou anglais), enregistré sur le compte : personnel (`PATCH /auth/language`) et
 * responsables (`PATCH /portal/language`). Vide tant que l'utilisateur n'a pas choisi : la langue de l'appareil
 * s'applique alors côté navigateur.
 */
describe('Langue de l’utilisateur (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  const PHONE = '242060000077';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    admin = (await login('admin@shakespeareacademy.cg', 'ChangeMe123!')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  async function login(email: string, motDePasse: string) {
    const res = await http()
      .post('/auth/login')
      .send({ email, motDePasse })
      .expect(201);
    return {
      token: res.body.accessToken as string,
      user: res.body.user as { langue: string | null },
    };
  }
  const authed = (method: 'get' | 'patch', path: string, t: string) =>
    http()[method](path).set('Authorization', `Bearer ${t}`);

  async function activeParent() {
    const student = (
      await http()
        .post('/students')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          nom: 'Test',
          prenom: 'Langue',
          sexe: 'F',
          responsable: { nom: 'Moukala', prenom: 'Jean', telephone: PHONE },
        })
        .expect(201)
    ).body;
    const guardian = await prisma.guardian.findFirstOrThrow({
      where: { telephone: PHONE },
    });
    const code = (
      await http()
        .post(`/parent-accounts/guardians/${guardian.id}/activation-code`)
        .set('Authorization', `Bearer ${admin}`)
        .send({})
        .expect(201)
    ).body.code;
    const activated = await http()
      .post('/portal/activate')
      .send({
        telephone: PHONE,
        code,
        motDePasse: 'MotDePasse123',
        consentement: true,
        versionPolitique: '2026-09-v8',
      })
      .expect(201);
    return {
      student,
      token: activated.body.accessToken as string,
      parent: activated.body.parent as { langue: string | null },
    };
  }

  describe('personnel', () => {
    it('n’a aucune langue tant qu’il n’en a pas choisi, puis garde son choix à chaque connexion', async () => {
      const first = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
      expect(first.user.langue).toBeNull();
      expect(
        (await authed('get', '/auth/me', first.token).expect(200)).body.langue,
      ).toBeNull();

      const res = await authed('patch', '/auth/language', first.token)
        .send({ langue: 'en' })
        .expect(200);
      expect(res.body).toEqual({ langue: 'en' });

      expect(
        (await authed('get', '/auth/me', first.token).expect(200)).body.langue,
      ).toBe('en');
      // Une nouvelle connexion, sur un autre appareil : le choix suit le compte.
      const again = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
      expect(again.user.langue).toBe('en');

      await authed('patch', '/auth/language', again.token)
        .send({ langue: 'fr' })
        .expect(200);
      expect(
        (await authed('get', '/auth/me', again.token).expect(200)).body.langue,
      ).toBe('fr');
    });

    it('refuse une langue non prise en charge, ou absente', async () => {
      await authed('patch', '/auth/language', admin)
        .send({ langue: 'de' })
        .expect(400);
      await authed('patch', '/auth/language', admin).send({}).expect(400);
      await authed('patch', '/auth/language', admin)
        .send({ langue: 'EN' })
        .expect(400);
      expect(
        (await authed('get', '/auth/me', admin).expect(200)).body.langue,
      ).toBeNull();
    });

    it('ne change que la langue du compte connecté', async () => {
      const sch = await prisma.school.findFirstOrThrow();
      const { user, motDePasse } = await createUserWithRole(
        prisma,
        sch.id,
        'DIRECTION',
        { email: 'dir@test.local' },
      );
      const dir = await login(user.email, motDePasse);
      await authed('patch', '/auth/language', dir.token)
        .send({ langue: 'en' })
        .expect(200);
      expect(
        (await authed('get', '/auth/me', admin).expect(200)).body.langue,
      ).toBeNull();
    });

    it('demande une session', async () => {
      await http().patch('/auth/language').send({ langue: 'en' }).expect(401);
    });
  });

  describe('parents', () => {
    it('n’a aucune langue tant que le parent n’en a pas choisi, puis la garde à chaque connexion', async () => {
      const p = await activeParent();
      expect(p.parent.langue).toBeNull();
      expect(
        (await authed('get', '/portal/me', p.token).expect(200)).body.langue,
      ).toBeNull();

      const res = await authed('patch', '/portal/language', p.token)
        .send({ langue: 'en' })
        .expect(200);
      expect(res.body).toEqual({ langue: 'en' });
      expect(
        (await authed('get', '/portal/me', p.token).expect(200)).body.langue,
      ).toBe('en');

      const loggedIn = await http()
        .post('/portal/login')
        .send({ telephone: PHONE, motDePasse: 'MotDePasse123' })
        .expect(201);
      expect(loggedIn.body.parent.langue).toBe('en');
    });

    it('refuse une langue non prise en charge', async () => {
      const p = await activeParent();
      await authed('patch', '/portal/language', p.token)
        .send({ langue: 'es' })
        .expect(400);
    });

    it('chaque portail ne lit que ses propres jetons', async () => {
      const p = await activeParent();
      // Le jeton du personnel n'ouvre pas le portail, et inversement.
      await authed('patch', '/portal/language', admin)
        .send({ langue: 'en' })
        .expect(401);
      await authed('patch', '/auth/language', p.token)
        .send({ langue: 'en' })
        .expect(401);
      await http().patch('/portal/language').send({ langue: 'en' }).expect(401);
    });
  });

  describe('textes selon la langue de la requête', () => {
    const wrong = { telephone: PHONE, motDePasse: 'Faux12345678' };

    it('lit Accept-Language : le français par défaut, l’anglais s’il est demandé, jamais une autre langue', () => {
      expect(parseAcceptLanguage(undefined)).toBe('fr');
      expect(parseAcceptLanguage('en')).toBe('en');
      expect(parseAcceptLanguage('en-GB,en;q=0.9,fr;q=0.8')).toBe('en');
      expect(parseAcceptLanguage('fr-CG,fr;q=0.9,en;q=0.5')).toBe('fr');
      expect(parseAcceptLanguage('fr;q=0.3,en;q=0.9')).toBe('en');
      expect(parseAcceptLanguage('de,es;q=0.8')).toBe('fr');
      expect(parseAcceptLanguage('de,en;q=0.5')).toBe('en');
      expect(parseAcceptLanguage('en;q=0,fr')).toBe('fr');
    });

    it('un refus de connexion du parent suit la langue de la requête', async () => {
      await activeParent();
      const fr = await http().post('/portal/login').send(wrong).expect(401);
      expect(fr.body.message).toBe('Numéro ou mot de passe incorrect.');
      const en = await http()
        .post('/portal/login')
        .set('Accept-Language', 'en-GB,en;q=0.9')
        .send(wrong)
        .expect(401);
      expect(en.body.message).toBe('Incorrect number or password.');
      const other = await http()
        .post('/portal/login')
        .set('Accept-Language', 'de')
        .send(wrong)
        .expect(401);
      expect(other.body.message).toBe('Numéro ou mot de passe incorrect.');
    });

    it('une validation de formulaire suit la langue de la requête', async () => {
      const p = await activeParent();
      const body = { ancien: 'MotDePasse123', nouveau: 'court' };
      const fr = await authed('patch', '/portal/change-password', p.token)
        .send(body)
        .expect(400);
      expect(JSON.stringify(fr.body.message)).toContain(
        'au moins 8 caractères',
      );
      const en = await authed('patch', '/portal/change-password', p.token)
        .set('Accept-Language', 'en')
        .send(body)
        .expect(400);
      expect(JSON.stringify(en.body.message)).toContain(
        'at least 8 characters',
      );
    });

    it('une notification est lisible dans les deux langues, l’alerte suit la langue enregistrée du parent', async () => {
      const p = await activeParent();
      const push = app.get<FakePushSender>(PUSH_SENDER);
      push.reset();
      await authed('patch', '/portal/language', p.token)
        .send({ langue: 'en' })
        .expect(200);
      await http()
        .post('/portal/push/subscriptions')
        .set('Authorization', 'Bearer ' + p.token)
        .send({
          endpoint: 'https://push.example.test/abc',
          keys: { p256dh: 'p256dh-test', auth: 'auth-test' },
        })
        .expect(201);
      const notifications = app.get(NotificationsService);
      await notifications.notifyDiscipline(p.student.id);
      await notifications.idle();

      const fr = (
        await authed('get', '/portal/notifications', p.token).expect(200)
      ).body.notifications[0];
      expect(fr.titre).toBe('Vie scolaire');
      expect(fr.corps).toContain("Consultez l'onglet Vie scolaire");
      const en = (
        await http()
          .get('/portal/notifications')
          .set('Authorization', 'Bearer ' + p.token)
          .set('Accept-Language', 'en')
          .expect(200)
      ).body.notifications[0];
      expect(en.titre).toBe('School life');
      expect(en.corps).toBe(
        'A new school life item is available for Langue. Check the School life tab.',
      );
      // L'alerte suit la langue choisie par le parent, pas celle de la requête qui la déclenche.
      expect(push.sent).toHaveLength(1);
      expect(push.sent[0].payload.body).toBe(
        'A new school life item is available for Langue. Open the app to view it.',
      );
      // Rien de sensible sur le canal externe dans aucune des deux langues.
      expect(push.sent[0].payload.body).not.toMatch(/d/);

      // Le parent repasse au français : la prochaine alerte suit.
      await authed('patch', '/portal/language', p.token)
        .send({ langue: 'fr' })
        .expect(200);
      await notifications.notifyBulletinPublished(
        [{ id: p.student.id, prenom: 'Langue' }],
        'Trimestre 1',
      );
      await notifications.idle();
      expect(push.sent).toHaveLength(2);
      expect(push.sent[1].payload.body).toBe(
        "Un bulletin est disponible pour Langue. Ouvrez l'application pour le consulter.",
      );
    });

    it('une notification créée avant la version bilingue s’affiche en français dans les deux langues', async () => {
      const p = await activeParent();
      await app.get(NotificationsService).notifyDiscipline(p.student.id);
      await prisma.parentNotification.updateMany({
        data: { titreEn: null, corpsEn: null },
      });
      const en = (
        await http()
          .get('/portal/notifications')
          .set('Authorization', 'Bearer ' + p.token)
          .set('Accept-Language', 'en')
          .expect(200)
      ).body.notifications[0];
      expect(en.titre).toBe('Vie scolaire');
    });

    it('les libellés des préférences suivent la langue de la requête', async () => {
      const p = await activeParent();
      const en = await http()
        .get('/portal/notification-preferences')
        .set('Authorization', 'Bearer ' + p.token)
        .set('Accept-Language', 'en')
        .expect(200);
      expect(
        en.body.preferences.find((x: { type: string }) => x.type === 'ABSENCE')
          .libelle,
      ).toBe('Absence reported');
    });
  });
});

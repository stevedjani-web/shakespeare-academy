import { INestApplication } from '@nestjs/common';
import { createHash, createPrivateKey, createSign } from 'crypto';
import { httpbis } from 'http-message-signatures';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays } from '../src/timetable/timetable.util';
import { ONLINE_PAYMENT_PROVIDER } from '../src/online-payments/online-payment-provider.interface';
import { FakeOnlinePaymentProvider } from './utils/fake-online-payment-provider';
import {
  PAWAPAY_TEST_KEY_ID,
  PAWAPAY_TEST_PRIVATE_KEY_PEM,
} from './utils/pawapay-test-keypair';

const WEBHOOK_HOST = 'test.local';
const WEBHOOK_PATH = '/webhooks/payment/pawapay/deposit';
const privateKey = createPrivateKey(PAWAPAY_TEST_PRIVATE_KEY_PEM);

const sha512 = (data: string) =>
  createHash('sha512').update(data).digest('base64');

// Signature comme le fait PawaPay (RFC 9421, DER standard) avec la paire de test, jamais une vraie clé.
async function signBody(
  bodyString: string,
  path = WEBHOOK_PATH,
): Promise<Record<string, string>> {
  const signed = await httpbis.signMessage(
    {
      key: {
        id: PAWAPAY_TEST_KEY_ID,
        alg: 'ecdsa-p256-sha256',
        async sign(data: Buffer) {
          return createSign('SHA256').update(data).sign(privateKey);
        },
      },
      name: 'sig-pp',
      fields: [
        '@method',
        '@authority',
        '@path',
        'content-digest',
        'content-type',
      ],
    },
    {
      method: 'POST',
      url: `https://${WEBHOOK_HOST}${path}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Digest': `sha-512=:${sha512(bodyString)}:`,
      },
    },
  );
  return signed.headers as Record<string, string>;
}

/**
 * Lot 17 : paiement des frais par les parents (Mobile Money). Le paiement (et son reçu) ne naît qu'à la
 * confirmation signée du fournisseur ; une tentative échouée ne consomme aucun numéro de reçu (RG10).
 */
jest.setTimeout(30000);

describe('Paiement en ligne par les parents (e2e, Lot 17)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provider: FakeOnlinePaymentProvider;
  let token: string;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const PHONE_MOUKALA = '242060000001';
  const PHONE_ZOLA = '242060000002';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    provider = app.get(ONLINE_PAYMENT_PROVIDER);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    provider.reset();
    token = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string, motDePasse: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, motDePasse })
      .expect(201);
    return res.body.accessToken;
  }

  const get = (path: string, t?: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${t ?? token}`);
  const post = (path: string, body: object, t?: string) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t ?? token}`)
      .send(body);
  const patch = (path: string, body: object, t?: string) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${t ?? token}`)
      .send(body);
  const portalPost = (path: string, body: object) =>
    request(app.getHttpServer()).post(path).send(body);

  async function userToken(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      sch.id,
      roleCode,
      { email },
    );
    return login(user.email, motDePasse);
  }

  /** Deux familles, chacune avec un enfant et deux tranches (inscription 45000 et scolarité 90000). */
  async function school() {
    const section = (
      await post('/sections', { code: 'FR', nom: 'Francophone' })
    ).body;
    const cycle = (
      await post('/cycles', {
        sectionId: section.id,
        code: 'PRIM',
        nom: 'Primaire',
      })
    ).body;
    const level = (
      await post('/levels', { cycleId: cycle.id, code: 'CM2', nom: 'CM2' })
    ).body;
    const year = (
      await post('/academic-years', {
        libelle: '2026-2027',
        dateDebut: addDays(today, -120),
        dateFin: addDays(today, 200),
      })
    ).body;
    const klass = (
      await post('/classes', {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 A',
      })
    ).body;
    const inscription = (
      await post('/fee-types', {
        code: 'INSCRIPTION',
        nom: "Frais d'inscription",
        obligatoire: true,
        avecTranches: false,
      })
    ).body;
    const scolarite = (
      await post('/fee-types', {
        code: 'SCOLARITE',
        nom: 'Scolarité',
        obligatoire: true,
        avecTranches: false,
      })
    ).body;
    await post('/fee-schedules', {
      academicYearId: year.id,
      levelId: level.id,
      feeTypeId: inscription.id,
      montant: 45000,
    }).expect(201);
    await post('/fee-schedules', {
      academicYearId: year.id,
      levelId: level.id,
      feeTypeId: scolarite.id,
      montant: 90000,
    }).expect(201);

    const mk = async (
      nom: string,
      prenom: string,
      resp: { nom: string; prenom: string; telephone: string },
    ) => {
      const student = (
        await post('/students', {
          nom,
          prenom,
          sexe: 'F',
          dateNaissance: '2015-04-12',
          responsable: { ...resp, lien: 'Parent' },
        }).expect(201)
      ).body;
      const enrollment = (
        await post('/enrollments', {
          studentId: student.id,
          classId: klass.id,
          academicYearId: year.id,
        }).expect(201)
      ).body;
      await get(`/invoices/by-enrollment/${enrollment.id}`).expect(200);
      return { student, enrollment };
    };
    const alice = await mk('Moukala', 'Alice', {
      nom: 'Moukala',
      prenom: 'Jean',
      telephone: PHONE_MOUKALA,
    });
    const carine = await mk('Zola', 'Carine', {
      nom: 'Zola',
      prenom: 'Marie',
      telephone: PHONE_ZOLA,
    });
    const guardians = await prisma.guardian.findMany();
    const g = (tel: string) => guardians.find((x) => x.telephone === tel)!;
    return { alice, carine, moukala: g(PHONE_MOUKALA), zola: g(PHONE_ZOLA) };
  }

  async function activeParent(guardianId: string, telephone: string) {
    const { body } = await post(
      `/parent-accounts/guardians/${guardianId}/activation-code`,
      {},
    ).expect(201);
    const res = await portalPost('/portal/activate', {
      telephone,
      code: body.code,
      motDePasse: 'MotDePasse123',
      consentement: true,
      versionPolitique: '2026-09-v6',
    }).expect(201);
    return res.body.accessToken as string;
  }

  /** Famille prête à payer : école configurée, interrupteur activé, parents connectés. */
  async function ready(enable = true) {
    const s = await school();
    if (enable)
      await patch('/school', { paiementEnLigneActif: true }).expect(200);
    const moukala = await activeParent(s.moukala.id, PHONE_MOUKALA);
    const zola = await activeParent(s.zola.id, PHONE_ZOLA);
    const tranches = async (t: string, studentId: string) =>
      (await get(`/portal/children/${studentId}/finance`, t).expect(200)).body
        .tranches as Array<{
        trancheId: string;
        libelle: string;
        solde: number;
        enAttente: { id: string } | null;
      }>;
    const aliceTranches = await tranches(moukala, s.alice.student.id);
    const inscription = aliceTranches.find((t) =>
      t.libelle.toLowerCase().includes('inscription'),
    )!;
    const scolarite = aliceTranches.find((t) =>
      t.libelle.toLowerCase().includes('scolarit'),
    )!;
    const carineTranches = await tranches(zola, s.carine.student.id);
    return {
      ...s,
      moukalaToken: moukala,
      zolaToken: zola,
      inscription,
      scolarite,
      carineTranche: carineTranches[0],
    };
  }

  const payTranche = (t: string, studentId: string, body: object) =>
    post(`/portal/children/${studentId}/payments`, body, t);

  async function startPayment(
    f: Awaited<ReturnType<typeof ready>>,
    montant = 20000,
    trancheId = f.inscription.trancheId,
  ) {
    const res = await payTranche(f.moukalaToken, f.alice.student.id, {
      trancheId,
      montant,
      telephone: '06 000 00 01',
    }).expect(201);
    const row = await prisma.onlinePayment.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    return { id: res.body.id as string, depositId: row.depositId };
  }

  const webhook = (
    headers: Record<string, string>,
    bodyString: string,
    path = WEBHOOK_PATH,
  ) =>
    request(app.getHttpServer())
      .post(path)
      .set('Host', WEBHOOK_HOST)
      .set('X-Forwarded-Proto', 'https')
      .set(headers)
      .send(bodyString);

  async function callback(
    depositId: string,
    status: 'COMPLETED' | 'FAILED',
    extra: object = {},
  ) {
    const body = JSON.stringify({ depositId, status, ...extra });
    return webhook(await signBody(body), body);
  }

  describe('disponibilité', () => {
    it("l'interrupteur est éteint par défaut : aucun paiement proposé ni accepté", async () => {
      const f = await ready(false);
      const data = (
        await get(
          `/portal/children/${f.alice.student.id}/finance`,
          f.moukalaToken,
        ).expect(200)
      ).body;
      expect(data.paiementEnLigne).toBe(false);
      await payTranche(f.moukalaToken, f.alice.student.id, {
        trancheId: f.inscription.trancheId,
        montant: 1000,
        telephone: '060000001',
      }).expect(409);
      expect(await prisma.onlinePayment.count()).toBe(0);
    });

    it('le paiement est indisponible sans clés du fournisseur, même interrupteur allumé', async () => {
      const f = await ready();
      provider.configured = false;
      const data = (
        await get(
          `/portal/children/${f.alice.student.id}/finance`,
          f.moukalaToken,
        ).expect(200)
      ).body;
      expect(data.paiementEnLigne).toBe(false);
      await payTranche(f.moukalaToken, f.alice.student.id, {
        trancheId: f.inscription.trancheId,
        montant: 1000,
        telephone: '060000001',
      }).expect(409);
    });

    it("seul l'Administrateur règle l'interrupteur", async () => {
      await school();
      const sec = await userToken('SECRETAIRE_CAISSIER', 'sec@test.local');
      await patch('/school', { paiementEnLigneActif: true }, sec).expect(403);
      await patch('/school', { paiementEnLigneActif: 'oui' }).expect(400);
      const res = await patch('/school', { paiementEnLigneActif: true }).expect(
        200,
      );
      expect(res.body.paiementEnLigneActif).toBe(true);
    });

    it('le portail liste les tranches à payer sans identifiant interne de facturation', async () => {
      const f = await ready();
      const data = (
        await get(
          `/portal/children/${f.alice.student.id}/finance`,
          f.moukalaToken,
        ).expect(200)
      ).body;
      expect(data.paiementEnLigne).toBe(true);
      expect(data.tranches).toHaveLength(2);
      expect(f.inscription.solde).toBe(45000);
      expect(f.scolarite.solde).toBe(90000);
      expect(JSON.stringify(data)).not.toContain('invoiceLineId');
    });
  });

  describe('initiation', () => {
    it('lance un dépôt chez le fournisseur sans créer de paiement ni consommer de numéro de reçu', async () => {
      const f = await ready();
      const started = await startPayment(f, 20000);
      expect(provider.initiated).toHaveLength(1);
      expect(provider.initiated[0]).toMatchObject({
        montant: 20000,
        devise: 'XAF',
        telephone: '242060000001',
      });
      expect(provider.initiated[0].depositId).toBe(started.depositId);
      expect(await prisma.payment.count()).toBe(0);
      expect(
        await prisma.numberSequence.count({ where: { type: 'RECEIPT' } }),
      ).toBe(0);
      const row = await prisma.onlinePayment.findUniqueOrThrow({
        where: { id: started.id },
      });
      expect(row).toMatchObject({
        statut: 'EN_ATTENTE',
        montant: 20000,
        telephone: '242060000001',
      });
      expect(row.guardianId).toBe(f.moukala.id);
      const finance = (
        await get(
          `/portal/children/${f.alice.student.id}/finance`,
          f.moukalaToken,
        ).expect(200)
      ).body;
      expect(finance.situation.montantPaye).toBe(0);
      expect(
        finance.tranches.find(
          (t: { libelle: string }) => t.libelle === f.inscription.libelle,
        ).enAttente.id,
      ).toBe(started.id);
    });

    it("refuse l'enfant d'une autre famille et une tranche qui n'est pas la sienne (404)", async () => {
      const f = await ready();
      const body = {
        trancheId: f.inscription.trancheId,
        montant: 1000,
        telephone: '060000001',
      };
      await payTranche(f.zolaToken, f.alice.student.id, body).expect(404); // enfant d'une autre famille
      await payTranche(f.moukalaToken, f.alice.student.id, {
        ...body,
        trancheId: f.carineTranche.trancheId,
      }).expect(404); // tranche d'un autre élève
      await payTranche(f.moukalaToken, f.alice.student.id, {
        ...body,
        trancheId: 'inconnue',
      }).expect(404);
      expect(await prisma.onlinePayment.count()).toBe(0);
      expect(provider.initiated).toHaveLength(0);
    });

    it('refuse un montant au-dessus du solde, nul, décimal, et un numéro invalide', async () => {
      const f = await ready();
      const base = {
        trancheId: f.inscription.trancheId,
        telephone: '060000001',
      };
      await payTranche(f.moukalaToken, f.alice.student.id, {
        ...base,
        montant: 45001,
      }).expect(400);
      await payTranche(f.moukalaToken, f.alice.student.id, {
        ...base,
        montant: 0,
      }).expect(400);
      await payTranche(f.moukalaToken, f.alice.student.id, {
        ...base,
        montant: 100.5,
      }).expect(400);
      await payTranche(f.moukalaToken, f.alice.student.id, {
        ...base,
        montant: 1000,
        telephone: '12345678',
      }).expect(400);
      await payTranche(f.moukalaToken, f.alice.student.id, {
        ...base,
        montant: 45000,
      }).expect(201); // le solde entier est permis
    });

    it('une seule tentative en attente par tranche, une autre tranche reste possible', async () => {
      const f = await ready();
      await startPayment(f, 10000);
      await payTranche(f.moukalaToken, f.alice.student.id, {
        trancheId: f.inscription.trancheId,
        montant: 5000,
        telephone: '060000001',
      }).expect(409);
      await startPayment(f, 30000, f.scolarite.trancheId);
      expect(
        await prisma.onlinePayment.count({ where: { statut: 'EN_ATTENTE' } }),
      ).toBe(2);
    });

    it('un refus du fournisseur donne une phrase claire, marque la tentative en échec et laisse réessayer', async () => {
      const f = await ready();
      provider.refuseWith = "Ce numéro n'est pas pris en charge.";
      const res = await payTranche(f.moukalaToken, f.alice.student.id, {
        trancheId: f.inscription.trancheId,
        montant: 1000,
        telephone: '060000001',
      }).expect(422);
      expect(res.body.message).toBe("Ce numéro n'est pas pris en charge.");
      const row = await prisma.onlinePayment.findFirstOrThrow();
      expect(row).toMatchObject({
        statut: 'ECHOUE',
        motifEchec: "Ce numéro n'est pas pris en charge.",
      });
      provider.refuseWith = null;
      await startPayment(f, 1000);
    });
  });

  describe('retour signé du fournisseur', () => {
    it('signature absente, invalide ou corps modifié : 403, aucun changement', async () => {
      const f = await ready();
      const { depositId, id } = await startPayment(f);
      const body = JSON.stringify({ depositId, status: 'COMPLETED' });

      await request(app.getHttpServer())
        .post(WEBHOOK_PATH)
        .set('Host', WEBHOOK_HOST)
        .set('X-Forwarded-Proto', 'https')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(403);

      const garbage = await signBody(body);
      garbage['Signature'] = 'sig-pp=:Z2FyYmFnZS1zaWduYXR1cmU=:';
      await webhook(garbage, body).expect(403);

      // Corps ET Content-Digest modifiés après signature, signature non renouvelée.
      const tampered = JSON.stringify({
        depositId,
        status: 'COMPLETED',
        extra: 'x',
      });
      const tamperedHeaders = await signBody(body);
      tamperedHeaders['Content-Digest'] = `sha-512=:${sha512(tampered)}:`;
      await webhook(tamperedHeaders, tampered).expect(403);

      // Content-Digest incohérent avec le corps réellement envoyé, signature intacte.
      await webhook(await signBody(body), tampered).expect(403);

      expect(
        (await prisma.onlinePayment.findUniqueOrThrow({ where: { id } }))
          .statut,
      ).toBe('EN_ATTENTE');
      expect(await prisma.payment.count()).toBe(0);
    });

    it('COMPLETED crée un seul paiement avec un reçu séquentiel, réduit le solde, et un rejeu ne fait rien', async () => {
      const f = await ready();
      const { depositId, id } = await startPayment(f, 20000);

      await callback(depositId, 'COMPLETED').then((r) =>
        expect(r.status).toBe(200),
      );
      await callback(depositId, 'COMPLETED').then((r) =>
        expect(r.status).toBe(200),
      ); // rejeu

      const payments = await prisma.payment.findMany();
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({
        numeroRecu: 'REC-000001',
        montant: 20000,
        modePaiement: 'MOBILE_MONEY',
        referenceExterne: depositId,
        statut: 'VALIDE',
        recuParUserId: null,
      });
      const row = await prisma.onlinePayment.findUniqueOrThrow({
        where: { id },
      });
      expect(row).toMatchObject({
        statut: 'CONFIRME',
        paymentId: payments[0].id,
      });
      expect(
        await prisma.numberSequence.findFirstOrThrow({
          where: { type: 'RECEIPT' },
        }),
      ).toMatchObject({ dernierNumero: 1 });

      const finance = (
        await get(
          `/portal/children/${f.alice.student.id}/finance`,
          f.moukalaToken,
        ).expect(200)
      ).body;
      expect(finance.situation).toMatchObject({
        montantPaye: 20000,
        montantRestant: 115000,
      });
      expect(finance.paiements[0]).toMatchObject({
        numeroRecu: 'REC-000001',
        modePaiement: 'MOBILE_MONEY',
      });
      expect(
        finance.tranches.find(
          (t: { libelle: string }) => t.libelle === f.inscription.libelle,
        ),
      ).toMatchObject({ solde: 25000, enAttente: null });

      const audit = await prisma.auditLog.findMany({
        where: { action: 'PAYMENT_ONLINE_CONFIRM' },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].userId).toBeNull();
    });

    it("FAILED n'invente aucun paiement et ne consomme aucun numéro : le reçu suivant n'a pas de trou", async () => {
      const f = await ready();
      const failed = await startPayment(f, 10000);
      await callback(failed.depositId, 'FAILED', {
        failureReason: { failureCode: 'INSUFFICIENT_BALANCE' },
      }).then((r) => expect(r.status).toBe(200));
      const row = await prisma.onlinePayment.findUniqueOrThrow({
        where: { id: failed.id },
      });
      expect(row).toMatchObject({
        statut: 'ECHOUE',
        motifEchec: 'Solde insuffisant sur votre compte Mobile Money.',
      });
      expect(await prisma.payment.count()).toBe(0);
      expect(
        await prisma.numberSequence.count({ where: { type: 'RECEIPT' } }),
      ).toBe(0);

      const ok = await startPayment(f, 10000);
      await callback(ok.depositId, 'COMPLETED');
      expect((await prisma.payment.findFirstOrThrow()).numeroRecu).toBe(
        'REC-000001',
      );
    });

    it("un retour COMPLETED sur une tentative marquée en échec à l'initiation est accepté : le fournisseur fait foi", async () => {
      const f = await ready();
      const { depositId, id } = await startPayment(f, 10000);
      await prisma.onlinePayment.update({
        where: { id },
        data: { statut: 'ECHOUE', motifEchec: 'Réponse ambiguë' },
      });
      await callback(depositId, 'COMPLETED');
      expect(
        (await prisma.onlinePayment.findUniqueOrThrow({ where: { id } }))
          .statut,
      ).toBe('CONFIRME');
      expect(await prisma.payment.count()).toBe(1);
    });

    it('un dépôt inconnu et un état intermédiaire répondent 200 sans rien changer ; payout et refund sont acceptés', async () => {
      const f = await ready();
      const { depositId, id } = await startPayment(f);
      await callback('00000000-0000-0000-0000-000000000000', 'COMPLETED').then(
        (r) => expect(r.status).toBe(200),
      );
      const processing = JSON.stringify({ depositId, status: 'PROCESSING' });
      await webhook(await signBody(processing), processing).expect(200);
      expect(
        (await prisma.onlinePayment.findUniqueOrThrow({ where: { id } }))
          .statut,
      ).toBe('EN_ATTENTE');
      for (const kind of ['payout', 'refund']) {
        const path = `/webhooks/payment/pawapay/${kind}`;
        const body = JSON.stringify({ payoutId: 'x', status: 'COMPLETED' });
        await webhook(await signBody(body, path), body, path).expect(200);
        await webhook(
          { 'Content-Type': 'application/json' },
          body,
          path,
        ).expect(403);
      }
      expect(await prisma.payment.count()).toBe(0);
    });

    it("si le solde a disparu entre-temps, l'argent pris est mis « à traiter » sans reçu ni trou de numérotation", async () => {
      const f = await ready();
      const { depositId, id } = await startPayment(f, 45000);
      // Encaissement complet au guichet pendant que le parent validait sur son téléphone.
      const line = await prisma.invoiceLine.findFirstOrThrow({
        where: { id: f.inscription.trancheId },
      });
      await post('/payments', {
        invoiceLineId: line.id,
        montant: 45000,
      }).expect(201); // REC-000001

      await callback(depositId, 'COMPLETED');
      const row = await prisma.onlinePayment.findUniqueOrThrow({
        where: { id },
      });
      expect(row.statut).toBe('A_TRAITER');
      expect(row.paymentId).toBeNull();
      expect(await prisma.payment.count()).toBe(1);
      expect(
        await prisma.numberSequence.findFirstOrThrow({
          where: { type: 'RECEIPT' },
        }),
      ).toMatchObject({ dernierNumero: 1 });
      expect(
        await prisma.auditLog.count({
          where: { action: 'PAYMENT_ONLINE_UNMATCHED' },
        }),
      ).toBe(1);

      // Le prochain reçu reprend la suite, sans trou.
      await post('/payments', {
        invoiceLineId: f.scolarite.trancheId,
        montant: 1000,
      }).expect(201);
      expect(
        (await prisma.payment.findMany({ orderBy: { numeroRecu: 'asc' } })).map(
          (p) => p.numeroRecu,
        ),
      ).toEqual(['REC-000001', 'REC-000002']);
    });
  });

  describe('retour perdu', () => {
    it('une tentative en attente depuis plus de 2 minutes est revérifiée à la lecture par le parent', async () => {
      const f = await ready();
      const { depositId, id } = await startPayment(f, 15000);
      // Récente : pas de revérification.
      let res = await get(`/portal/payments/${id}`, f.moukalaToken).expect(200);
      expect(res.body.statut).toBe('EN_ATTENTE');
      expect(provider.statusCalls).toEqual([]);

      await prisma.onlinePayment.update({
        where: { id },
        data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
      provider.statuses.set(depositId, { statut: 'COMPLETED' });
      res = await get(`/portal/payments/${id}`, f.moukalaToken).expect(200);
      expect(res.body).toMatchObject({
        statut: 'CONFIRME',
        montant: 15000,
        paiement: { numeroRecu: 'REC-000001' },
      });
      expect(await prisma.payment.count()).toBe(1);
    });

    it('une revérification qui échoue ne casse rien : la tentative reste en attente', async () => {
      const f = await ready();
      const { id } = await startPayment(f);
      await prisma.onlinePayment.update({
        where: { id },
        data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
      provider.failStatusLookup = true;
      const res = await get(`/portal/payments/${id}`, f.moukalaToken).expect(
        200,
      );
      expect(res.body.statut).toBe('EN_ATTENTE');
    });

    it('une tentative abandonnée depuis longtemps ne bloque plus la tranche : elle est revérifiée à la nouvelle demande', async () => {
      const f = await ready();
      const { depositId, id } = await startPayment(f, 10000);
      await prisma.onlinePayment.update({
        where: { id },
        data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
      provider.statuses.set(depositId, {
        statut: 'FAILED',
        motif: "Le paiement n'a pas été validé sur votre téléphone à temps.",
      });
      await startPayment(f, 10000); // 201 : l'ancienne est passée en échec
      expect(
        (await prisma.onlinePayment.findUniqueOrThrow({ where: { id } }))
          .statut,
      ).toBe('ECHOUE');
    });

    it('le parent ne lit que ses propres tentatives (404 pour un autre responsable)', async () => {
      const f = await ready();
      const { id } = await startPayment(f);
      await get(`/portal/payments/${id}`, f.zolaToken).expect(404);
      await get('/portal/payments/inconnu', f.moukalaToken).expect(404);
    });
  });

  describe('reçu du parent', () => {
    it("le parent lit le reçu d'un paiement de son enfant, jamais celui d'une autre famille", async () => {
      const f = await ready();
      const { depositId } = await startPayment(f, 20000);
      await callback(depositId, 'COMPLETED');
      const payment = await prisma.payment.findFirstOrThrow();
      const res = await get(
        `/portal/children/${f.alice.student.id}/payments/${payment.id}/receipt`,
        f.moukalaToken,
      ).expect(200);
      expect(res.body).toMatchObject({
        numeroRecu: 'REC-000001',
        montant: 20000,
        devise: 'XAF',
        modePaiement: 'MOBILE_MONEY',
        statut: 'VALIDE',
      });
      expect(res.body.eleve).toMatchObject({ prenom: 'Alice', nom: 'Moukala' });
      expect(JSON.stringify(res.body)).not.toContain('verificationToken');
      await get(
        `/portal/children/${f.alice.student.id}/payments/${payment.id}/receipt`,
        f.zolaToken,
      ).expect(404);
      await get(
        `/portal/children/${f.carine.student.id}/payments/${payment.id}/receipt`,
        f.zolaToken,
      ).expect(404); // paiement d'un autre élève
    });

    it("la Direction peut annuler un paiement en ligne (personne ne l'a encaissé), et le solde revient", async () => {
      const f = await ready();
      const { depositId } = await startPayment(f, 20000);
      await callback(depositId, 'COMPLETED');
      const payment = await prisma.payment.findFirstOrThrow();
      const dir = await userToken('DIRECTION', 'dir@test.local');
      await post(
        `/payments/${payment.id}/cancel`,
        { motif: 'Remboursement demandé par le parent' },
        dir,
      ).expect(201);
      const finance = (
        await get(
          `/portal/children/${f.alice.student.id}/finance`,
          f.moukalaToken,
        ).expect(200)
      ).body;
      expect(finance.situation.montantPaye).toBe(0);
    });
  });

  describe('suivi par le personnel', () => {
    it('liste, vérifie et clôture avec les bons droits', async () => {
      const f = await ready();
      const pending = await startPayment(f, 10000);
      const orphan = await startPayment(f, 45000, f.scolarite.trancheId);
      // Un paiement qui n'a plus de solde à imputer.
      await post('/payments', {
        invoiceLineId: f.scolarite.trancheId,
        montant: 90000,
      }).expect(201);
      await callback(orphan.depositId, 'COMPLETED');

      const compta = await userToken('COMPTABLE', 'cpt@test.local');
      const sec = await userToken('SECRETAIRE_CAISSIER', 'sec@test.local');
      const dir = await userToken('DIRECTION', 'dir@test.local');
      const teacher = await userToken('ENSEIGNANT', 'ens@test.local');
      await request(app.getHttpServer()).get('/online-payments').expect(401);
      await get('/online-payments', teacher).expect(403);

      const list = (await get('/online-payments', compta).expect(200))
        .body as Array<{
        id: string;
        statut: string;
        eleve: { prenom: string };
        responsable: { nom: string };
      }>;
      expect(list).toHaveLength(2);
      expect(list.find((r) => r.id === pending.id)).toMatchObject({
        statut: 'EN_ATTENTE',
        eleve: { prenom: 'Alice' },
        responsable: { nom: 'Moukala' },
      });
      expect(
        (
          await get('/online-payments?statut=A_TRAITER', sec).expect(200)
        ).body.map((r: { id: string }) => r.id),
      ).toEqual([orphan.id]);
      await get('/online-payments?statut=n_importe_quoi', sec).expect(400);

      // Vérifier : le fournisseur dit échoué.
      provider.statuses.set(pending.depositId, {
        statut: 'FAILED',
        motif: 'Solde insuffisant sur votre compte Mobile Money.',
      });
      const rec = (
        await post(`/online-payments/${pending.id}/reconcile`, {}, sec).expect(
          200,
        )
      ).body;
      expect(rec.statut).toBe('ECHOUE');
      await post('/online-payments/inconnu/reconcile', {}, sec).expect(404);

      // Clôturer : seule la Direction, avec un motif, une seule fois.
      await post(
        `/online-payments/${orphan.id}/resolve`,
        { motif: 'Remboursé au parent' },
        sec,
      ).expect(403);
      await post(`/online-payments/${orphan.id}/resolve`, {
        motif: 'Remboursé au parent',
      }).expect(403); // Administrateur : pas la Direction
      await post(
        `/online-payments/${orphan.id}/resolve`,
        { motif: 'x' },
        dir,
      ).expect(400);
      await post(
        `/online-payments/${pending.id}/resolve`,
        { motif: 'Remboursé au parent' },
        dir,
      ).expect(409); // pas « à traiter »
      const done = (
        await post(
          `/online-payments/${orphan.id}/resolve`,
          { motif: 'Remboursé au parent' },
          dir,
        ).expect(200)
      ).body;
      expect(done.motifCloture).toBe('Remboursé au parent');
      await post(
        `/online-payments/${orphan.id}/resolve`,
        { motif: 'Remboursé au parent' },
        dir,
      ).expect(409);
      expect(
        (await get('/online-payments?statut=A_TRAITER', dir).expect(200))
          .body[0].cloture,
      ).toBe(true);
      expect(
        await prisma.auditLog.count({
          where: { action: 'PAYMENT_ONLINE_RESOLVE' },
        }),
      ).toBe(1);
    });

    it('« Vérifier » signale un fournisseur injoignable sans rien modifier', async () => {
      const f = await ready();
      const { id } = await startPayment(f);
      provider.failStatusLookup = true;
      await post(`/online-payments/${id}/reconcile`, {}).expect(503);
      expect(
        (await prisma.onlinePayment.findUniqueOrThrow({ where: { id } }))
          .statut,
      ).toBe('EN_ATTENTE');
    });
  });

  describe('aucune notification financière (D70)', () => {
    it("ni la tentative, ni la confirmation, ni l'échec ne créent de notification pour le parent", async () => {
      const f = await ready();
      const before = await prisma.parentNotification.count();
      const a = await startPayment(f, 10000);
      await callback(a.depositId, 'COMPLETED');
      const b = await startPayment(f, 10000);
      await callback(b.depositId, 'FAILED');
      expect(await prisma.parentNotification.count()).toBe(before);
    });
  });
});

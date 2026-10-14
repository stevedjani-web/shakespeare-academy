import { INestApplication } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { PDF_BYTES } from './utils/expenses';
import { addDays } from '../src/timetable/timetable.util';

/**
 * Paiement par banque (virement, dépôt, chèque) : une déclaration avec preuve n'est pas un paiement. Le Promoteur confirme
 * le crédit sur le relevé de la banque, le secrétariat valide, et c'est seulement là que les paiements et leurs reçus
 * séquentiels (RG10) naissent. Une preuve peut couvrir plusieurs tranches et plusieurs enfants d'une famille.
 */
jest.setTimeout(30000);

describe('Paiement par banque (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let counter = 0;

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
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
    counter = 0;
    adminToken = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
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
      .set('Authorization', `Bearer ${t ?? adminToken}`);
  const post = (path: string, body: object, t?: string) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t ?? adminToken}`)
      .send(body);
  const patch = (path: string, body: object, t?: string) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${t ?? adminToken}`)
      .send(body);
  const del = (path: string, t?: string) =>
    request(app.getHttpServer())
      .delete(path)
      .set('Authorization', `Bearer ${t ?? adminToken}`);

  /** Un contenu unique à chaque appel : la même preuve ne sert pas deux déclarations. */
  const uniqueProof = () =>
    Buffer.concat([
      PDF_BYTES,
      Buffer.from(`preuve-${++counter}-${Date.now()}`),
    ]);

  async function userToken(
    roleCode: string,
    email: string,
  ): Promise<{ token: string; id: string }> {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      sch.id,
      roleCode,
      { email },
    );
    return { token: await login(user.email, motDePasse), id: user.id };
  }

  /** Le Promoteur de production : confirme le crédit, peut aussi encaisser et annuler (pour tester la séparation des tâches). */
  async function promoter(email = 'promoteur@test.local') {
    const sch = await prisma.school.findFirstOrThrow();
    const codes = [
      'BANK_PAYMENT_CONFIRM',
      'FINANCE_READ',
      'PAYMENT_CREATE',
      'PAYMENT_CANCEL_APPROVE',
      'CASH_CLOSE',
    ];
    const perms = await prisma.permission.findMany({
      where: { code: { in: codes } },
    });
    expect(perms).toHaveLength(codes.length);
    const role =
      (await prisma.role.findUnique({ where: { code: 'PRO' } })) ??
      (await prisma.role.create({
        data: { code: 'PRO', nom: 'Promoteur', description: 't' },
      }));
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      sch.id,
      'PRO',
      { email },
    );
    return { token: await login(user.email, motDePasse), id: user.id };
  }

  /** Deux familles : les Moukala (Alice et Brice, même responsable) et les Zola (Carine). Chaque enfant : inscription 45 000 et scolarité 90 000. */
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
    for (const [code, nom, montant] of [
      ['INSCRIPTION', "Frais d'inscription", 45000],
      ['SCOLARITE', 'Scolarité', 90000],
    ] as const) {
      const type = (
        await post('/fee-types', {
          code,
          nom,
          obligatoire: true,
          avecTranches: false,
        })
      ).body;
      await post('/fee-schedules', {
        academicYearId: year.id,
        levelId: level.id,
        feeTypeId: type.id,
        montant,
      }).expect(201);
    }
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
      await post('/enrollments', {
        studentId: student.id,
        classId: klass.id,
        academicYearId: year.id,
      }).expect(201);
      return student as { id: string };
    };
    const moukala = {
      nom: 'Moukala',
      prenom: 'Jean',
      telephone: PHONE_MOUKALA,
    };
    const alice = await mk('Moukala', 'Alice', moukala);
    const brice = await mk('Moukala', 'Brice', moukala);
    const carine = await mk('Zola', 'Carine', {
      nom: 'Zola',
      prenom: 'Marie',
      telephone: PHONE_ZOLA,
    });
    const guardians = await prisma.guardian.findMany();
    const g = (tel: string) => guardians.find((x) => x.telephone === tel)!;
    return {
      alice,
      brice,
      carine,
      moukala: g(PHONE_MOUKALA),
      zola: g(PHONE_ZOLA),
    };
  }

  async function activeParent(guardianId: string, telephone: string) {
    const { body } = await post(
      `/parent-accounts/guardians/${guardianId}/activation-code`,
      {},
    ).expect(201);
    const res = await request(app.getHttpServer())
      .post('/portal/activate')
      .send({
        telephone,
        code: body.code,
        motDePasse: 'MotDePasse123',
        consentement: true,
        versionPolitique: '2026-09-v10',
      })
      .expect(201);
    return res.body.accessToken as string;
  }

  type Context = {
    actif: boolean;
    comptes: Array<{ id: string; banque: string }>;
    enfants: Array<{
      id: string;
      prenom: string;
      tranches: Array<{
        trancheId: string;
        libelle: string;
        solde: number;
        enCours: number;
        disponible: number;
      }>;
    }>;
  };

  /** École configurée (un compte bancaire), parents connectés, tranches repérées par enfant. */
  async function ready(withAccount = true) {
    const s = await school();
    let account: { id: string } | null = null;
    if (withAccount) {
      account = (
        await post('/school-bank-accounts', {
          banque: 'BGFI Bank',
          titulaire: 'Shakespeare Academy',
          numero: 'CG59 30001 00001 12345678901 23',
          instructions: 'Indiquez le matricule de l’élève.',
        }).expect(201)
      ).body;
    }
    const moukalaToken = await activeParent(s.moukala.id, PHONE_MOUKALA);
    const zolaToken = await activeParent(s.zola.id, PHONE_ZOLA);
    const ctx = (
      await get('/portal/bank-payments/context', moukalaToken).expect(200)
    ).body as Context;
    const line = (child: string, word: string) =>
      ctx.enfants
        .find((e) => e.prenom === child)!
        .tranches.find((t) => t.libelle.toLowerCase().includes(word))!;
    const zolaCtx = (
      await get('/portal/bank-payments/context', zolaToken).expect(200)
    ).body as Context;
    return {
      ...s,
      account,
      moukalaToken,
      zolaToken,
      ctx,
      zolaLine: zolaCtx.enfants[0].tranches[0],
      aliceInscription: line('Alice', 'inscription'),
      aliceScolarite: line('Alice', 'scolarit'),
      briceInscription: line('Brice', 'inscription'),
      briceScolarite: line('Brice', 'scolarit'),
    };
  }
  type Ready = Awaited<ReturnType<typeof ready>>;

  let refSeq = 0;
  function payload(
    f: Ready,
    lignes: Array<{ trancheId: string; montant: number }>,
    extra: Record<string, unknown> = {},
  ) {
    return {
      methode: 'VIREMENT',
      montant: lignes.reduce((s, l) => s + l.montant, 0),
      banque: 'Ecobank',
      compteId: f.account?.id,
      referenceOperation: `VIR-${++refSeq}-${Date.now()}`,
      dateOperation: today,
      payeur: 'Jean Moukala',
      lignes,
      ...extra,
    };
  }

  function portalDeclare(
    token: string,
    body: Record<string, unknown>,
    options: { files?: number; proofs?: Buffer[] } = {},
  ) {
    let req = request(app.getHttpServer())
      .post('/portal/bank-payments')
      .set('Authorization', `Bearer ${token}`)
      .field('payload', JSON.stringify(body));
    const proofs =
      options.proofs ??
      Array.from({ length: options.files ?? 1 }, () => uniqueProof());
    proofs.forEach((buf, i) => {
      req = req.attach('preuve', buf, {
        filename: `preuve-${i + 1}.pdf`,
        contentType: 'application/pdf',
      });
    });
    return req;
  }

  function staffDeclare(
    token: string,
    body: Record<string, unknown>,
    files = 1,
  ) {
    let req = request(app.getHttpServer())
      .post('/bank-payments')
      .set('Authorization', `Bearer ${token}`)
      .field('payload', JSON.stringify(body));
    for (let i = 0; i < files; i++) {
      req = req.attach('preuve', uniqueProof(), {
        filename: `cheque-${i + 1}.pdf`,
        contentType: 'application/pdf',
      });
    }
    return req;
  }

  /** Déclaration de la famille Moukala : scolarité d'Alice + inscription de Brice (deux enfants, une preuve). */
  async function declareStandard(
    f: Ready,
    extra: Record<string, unknown> = {},
  ) {
    const res = await portalDeclare(
      f.moukalaToken,
      payload(
        f,
        [
          { trancheId: f.aliceScolarite.trancheId, montant: 90000 },
          { trancheId: f.briceInscription.trancheId, montant: 45000 },
        ],
        extra,
      ),
    ).expect(201);
    return res.body as { id: string };
  }

  const confirmBody = (montantCredite = 135000) => ({
    montantCredite,
    dateCredit: today,
    referenceReleve: 'REL-0001',
  });

  describe('comptes bancaires de l’école', () => {
    it('l’Administrateur les saisit, le secrétariat ne le peut pas, et le numéro de compte ne va jamais au journal', async () => {
      const secretary = await userToken(
        'SECRETAIRE_CAISSIER',
        'sec@test.local',
      );
      const body = {
        banque: 'BGFI Bank',
        titulaire: 'Shakespeare Academy',
        numero: 'CG59 30001 00001 12345678901 23',
      };
      await post('/school-bank-accounts', body, secretary.token).expect(403);
      const created = (await post('/school-bank-accounts', body).expect(201))
        .body;
      await patch(`/school-bank-accounts/${created.id}`, {
        instructions: 'Agence centrale',
      }).expect(200);
      const list = (
        await get('/school-bank-accounts', secretary.token).expect(200)
      ).body;
      expect(list).toHaveLength(1);
      expect(list[0].instructions).toBe('Agence centrale');
      const logs = await prisma.auditLog.findMany({
        where: { action: { startsWith: 'SCHOOL_BANK_ACCOUNT' } },
      });
      expect(logs).toHaveLength(2);
      expect(JSON.stringify(logs)).not.toContain('12345678901');
      await del(`/school-bank-accounts/${created.id}`).expect(200);
      expect(await prisma.schoolBankAccount.count()).toBe(0);
    });

    it('un compte cité par une déclaration ne se supprime pas : on le désactive, et le parent ne le voit plus', async () => {
      const f = await ready();
      await declareStandard(f);
      await del(`/school-bank-accounts/${f.account!.id}`).expect(409);
      await patch(`/school-bank-accounts/${f.account!.id}`, {
        actif: false,
      }).expect(200);
      const ctx = (
        await get('/portal/bank-payments/context', f.moukalaToken).expect(200)
      ).body as Context;
      expect(ctx.actif).toBe(false);
      expect(ctx.comptes).toEqual([]);
    });

    it('le parent voit les coordonnées de l’école, ses enfants et leurs tranches', async () => {
      const f = await ready();
      expect(f.ctx.actif).toBe(true);
      expect(f.ctx.comptes).toHaveLength(1);
      expect(f.ctx.comptes[0]).toMatchObject({
        banque: 'BGFI Bank',
        titulaire: 'Shakespeare Academy',
      });
      expect(f.ctx.enfants.map((e) => e.prenom)).toEqual(['Alice', 'Brice']);
      expect(f.aliceScolarite).toMatchObject({
        solde: 90000,
        enCours: 0,
        disponible: 90000,
      });
      // Jamais les enfants d'une autre famille.
      const all = JSON.stringify(f.ctx);
      expect(all).not.toContain('Carine');
    });
  });

  describe('déclaration par le parent', () => {
    it('une preuve couvre plusieurs tranches et plusieurs enfants : rien n’est un paiement, aucun reçu n’est consommé', async () => {
      const f = await ready();
      const claim = await declareStandard(f);
      const row = await prisma.bankPaymentClaim.findUniqueOrThrow({
        where: { id: claim.id },
        include: { lines: true, proofs: true },
      });
      expect(row).toMatchObject({
        statut: 'EN_ATTENTE',
        methode: 'VIREMENT',
        montant: 135000,
      });
      expect(row.lines).toHaveLength(2);
      expect(row.proofs).toHaveLength(1);
      expect(await prisma.payment.count()).toBe(0);
      expect(
        await prisma.numberSequence.count({ where: { type: 'RECEIPT' } }),
      ).toBe(0);
      // La preuve est un fichier privé, hors du dossier public.
      const stored = join(
        process.cwd(),
        'private-uploads',
        'bank-payments',
        row.proofs[0].fichier,
      );
      expect(existsSync(stored)).toBe(true);
      expect(row.proofs[0].fichier).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    });

    it('la déclaration réserve sa part : le contexte montre ce qui est en cours et le solde disponible baisse', async () => {
      const f = await ready();
      await declareStandard(f);
      const ctx = (
        await get('/portal/bank-payments/context', f.moukalaToken).expect(200)
      ).body as Context;
      const alice = ctx.enfants.find((e) => e.prenom === 'Alice')!;
      const scol = alice.tranches.find((t) => t.libelle.includes('Scolarit'))!;
      expect(scol).toMatchObject({
        solde: 90000,
        enCours: 90000,
        disponible: 0,
      });
      // Même tranche déjà couverte : refus clair.
      const res = await portalDeclare(
        f.moukalaToken,
        payload(f, [{ trancheId: f.aliceScolarite.trancheId, montant: 1000 }]),
      ).expect(409);
      expect(JSON.stringify(res.body)).toContain('Scolarité');
    });

    it('refus sans preuve, avec un faux fichier, une somme qui ne tombe pas juste, une date future ou un montant au-delà du solde', async () => {
      const f = await ready();
      const base = payload(f, [
        { trancheId: f.aliceInscription.trancheId, montant: 10000 },
      ]);
      await portalDeclare(f.moukalaToken, base, { files: 0 }).expect(400);
      await portalDeclare(f.moukalaToken, base, {
        proofs: [Buffer.from('MZ ceci n’est pas un justificatif')],
      }).expect(400);
      await portalDeclare(f.moukalaToken, { ...base, montant: 9000 }).expect(
        400,
      );
      await portalDeclare(f.moukalaToken, {
        ...base,
        dateOperation: addDays(today, 5),
      }).expect(400);
      await portalDeclare(
        f.moukalaToken,
        payload(f, [
          { trancheId: f.aliceInscription.trancheId, montant: 45001 },
        ]),
      ).expect(400);
      await portalDeclare(f.moukalaToken, {
        ...base,
        lignes: [
          { trancheId: f.aliceInscription.trancheId, montant: 5000 },
          { trancheId: f.aliceInscription.trancheId, montant: 5000 },
        ],
      }).expect(400);
      expect(await prisma.bankPaymentClaim.count()).toBe(0);
      expect(await prisma.bankPaymentProof.count()).toBe(0);
    });

    it('le compte de l’école est exigé pour un virement quand l’école en propose, jamais un compte inconnu', async () => {
      const f = await ready();
      const lignes = [
        { trancheId: f.aliceInscription.trancheId, montant: 10000 },
      ];
      await portalDeclare(
        f.moukalaToken,
        payload(f, lignes, { compteId: undefined }),
      ).expect(400);
      await portalDeclare(
        f.moukalaToken,
        payload(f, lignes, { compteId: 'inconnu' }),
      ).expect(400);
      // Un chèque remis à l'école n'en a pas besoin.
      await portalDeclare(
        f.moukalaToken,
        payload(f, lignes, { compteId: undefined, methode: 'CHEQUE' }),
      ).expect(201);
    });

    it('un parent ne déclare jamais pour l’enfant d’une autre famille (404)', async () => {
      const f = await ready();
      await portalDeclare(
        f.moukalaToken,
        payload(f, [{ trancheId: f.zolaLine.trancheId, montant: 1000 }]),
      ).expect(404);
      expect(await prisma.bankPaymentClaim.count()).toBe(0);
    });

    it('une même opération (banque et référence, casse et espaces ignorés) ou une même preuve ne sert qu’une fois', async () => {
      const f = await ready();
      const proof = uniqueProof();
      const first = payload(f, [
        { trancheId: f.aliceInscription.trancheId, montant: 5000 },
      ]);
      await portalDeclare(f.moukalaToken, first, { proofs: [proof] }).expect(
        201,
      );
      const other = [
        { trancheId: f.aliceInscription.trancheId, montant: 5000 },
      ];
      // Même banque et même référence, écrites autrement.
      await portalDeclare(
        f.moukalaToken,
        payload(f, other, {
          banque: ' ECOBANK ',
          referenceOperation:
            String(first.referenceOperation).toLowerCase() + ' ',
        }),
      ).expect(409);
      // Même fichier, autre référence.
      await portalDeclare(f.moukalaToken, payload(f, other), {
        proofs: [proof],
      }).expect(409);
      expect(await prisma.bankPaymentClaim.count()).toBe(1);
    });

    it('deux déclarations simultanées de la même opération : une seule passe', async () => {
      const f = await ready();
      const reference = `VIR-SIMULTANE-${Date.now()}`;
      const lignes = [
        { trancheId: f.aliceInscription.trancheId, montant: 5000 },
      ];
      const results = await Promise.all([
        portalDeclare(
          f.moukalaToken,
          payload(f, lignes, { referenceOperation: reference }),
        ),
        portalDeclare(
          f.moukalaToken,
          payload(f, lignes, { referenceOperation: reference }),
        ),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.bankPaymentClaim.count()).toBe(1);
    });

    it('au plus cinq déclarations en attente par responsable', async () => {
      const f = await ready();
      for (let i = 0; i < 5; i++) {
        await portalDeclare(
          f.moukalaToken,
          payload(f, [
            { trancheId: f.aliceScolarite.trancheId, montant: 1000 },
          ]),
        ).expect(201);
      }
      await portalDeclare(
        f.moukalaToken,
        payload(f, [{ trancheId: f.aliceScolarite.trancheId, montant: 1000 }]),
      ).expect(409);
    });

    it('un jeton du personnel n’ouvre pas le portail, un jeton de parent n’ouvre pas les routes du personnel', async () => {
      const f = await ready();
      await get('/portal/bank-payments/context').expect(401);
      await request(app.getHttpServer())
        .get('/portal/bank-payments/context')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(401);
      await get('/bank-payments', f.moukalaToken).expect(401);
      await request(app.getHttpServer()).get('/bank-payments').expect(401);
    });
  });

  describe('retrait par le parent', () => {
    it('il retire sa déclaration tant qu’elle attend ; une autre famille ne le peut pas', async () => {
      const f = await ready();
      const claim = await declareStandard(f);
      await post(
        `/portal/bank-payments/${claim.id}/withdraw`,
        {},
        f.zolaToken,
      ).expect(404);
      await post(
        `/portal/bank-payments/${claim.id}/withdraw`,
        {},
        f.moukalaToken,
      ).expect(201);
      const row = await prisma.bankPaymentClaim.findUniqueOrThrow({
        where: { id: claim.id },
      });
      expect(row.statut).toBe('RETIRE');
      // La réservation est rendue : la tranche est de nouveau disponible.
      const ctx = (
        await get('/portal/bank-payments/context', f.moukalaToken).expect(200)
      ).body as Context;
      expect(
        ctx.enfants
          .find((e) => e.prenom === 'Alice')!
          .tranches.find((t) => t.libelle.includes('Scolarit'))!.disponible,
      ).toBe(90000);
    });

    it('plus de retrait une fois le crédit confirmé', async () => {
      const f = await ready();
      const claim = await declareStandard(f);
      const pro = await promoter();
      await post(
        `/bank-payments/${claim.id}/confirm`,
        confirmBody(),
        pro.token,
      ).expect(201);
      await post(
        `/portal/bank-payments/${claim.id}/withdraw`,
        {},
        f.moukalaToken,
      ).expect(409);
    });
  });

  describe('confirmation du crédit par le Promoteur', () => {
    it('seul le droit BANK_PAYMENT_CONFIRM confirme : ni l’Administrateur ni le secrétariat', async () => {
      const f = await ready();
      const claim = await declareStandard(f);
      const secretary = await userToken(
        'SECRETAIRE_CAISSIER',
        'sec@test.local',
      );
      await post(`/bank-payments/${claim.id}/confirm`, confirmBody()).expect(
        403,
      );
      await post(
        `/bank-payments/${claim.id}/confirm`,
        confirmBody(),
        secretary.token,
      ).expect(403);
      expect(
        (
          await prisma.bankPaymentClaim.findUniqueOrThrow({
            where: { id: claim.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');
    });

    it('le droit est réservé : l’Administrateur ne peut pas se l’accorder', async () => {
      await ready();
      const role = await prisma.role.create({
        data: { code: 'AUTRE', nom: 'Autre', description: 't' },
      });
      const res = await request(app.getHttpServer())
        .put(`/roles/${role.id}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissionCodes: ['BANK_PAYMENT_CONFIRM'] });
      expect(res.status).toBe(403);
    });

    it('la confirmation enregistre le crédit réel ; on ne confirme pas une déclaration qu’on a faite soi-même, ni deux fois', async () => {
      const f = await ready();
      const pro = await promoter();
      // Déclarée par le Promoteur lui-même pour une famille : il ne peut pas la confirmer.
      const own = (
        await staffDeclare(
          pro.token,
          payload(
            f,
            [{ trancheId: f.aliceInscription.trancheId, montant: 10000 }],
            {
              guardianId: f.moukala.id,
              methode: 'CHEQUE',
              compteId: undefined,
            },
          ),
        ).expect(201)
      ).body;
      await post(
        `/bank-payments/${own.id}/confirm`,
        confirmBody(10000),
        pro.token,
      ).expect(403);

      const claim = await declareStandard(f);
      // Une date de crédit dans le futur est refusée, la déclaration reste en attente.
      await post(
        `/bank-payments/${claim.id}/confirm`,
        { ...confirmBody(), dateCredit: addDays(today, 5) },
        pro.token,
      ).expect(400);
      const res = await post(
        `/bank-payments/${claim.id}/confirm`,
        confirmBody(134000),
        pro.token,
      ).expect(201);
      expect(res.body).toMatchObject({
        statut: 'CREDIT_CONFIRME',
        montantCredite: 134000,
        referenceReleve: 'REL-0001',
      });
      await post(
        `/bank-payments/${claim.id}/confirm`,
        confirmBody(),
        pro.token,
      ).expect(409);
    });
  });

  describe('validation par le secrétariat', () => {
    async function confirmed(f: Ready, montantCredite = 135000) {
      const claim = await declareStandard(f);
      const pro = await promoter();
      await post(
        `/bank-payments/${claim.id}/confirm`,
        confirmBody(montantCredite),
        pro.token,
      ).expect(201);
      return { claim, pro };
    }

    it('sans confirmation du crédit, rien ne se valide', async () => {
      const f = await ready();
      const claim = await declareStandard(f);
      const secretary = await userToken(
        'SECRETAIRE_CAISSIER',
        'sec@test.local',
      );
      await post(
        `/bank-payments/${claim.id}/validate`,
        {},
        secretary.token,
      ).expect(409);
      expect(await prisma.payment.count()).toBe(0);
    });

    it('un paiement et un reçu séquentiel par tranche, au mode choisi, avec la référence et la date de la banque', async () => {
      const f = await ready();
      const { claim } = await confirmed(f);
      const secretary = await userToken(
        'SECRETAIRE_CAISSIER',
        'sec@test.local',
      );
      const res = await post(
        `/bank-payments/${claim.id}/validate`,
        {},
        secretary.token,
      ).expect(201);
      expect(res.body.statut).toBe('VALIDE');
      const payments = await prisma.payment.findMany({
        orderBy: { numeroRecu: 'asc' },
      });
      expect(payments.map((p) => p.numeroRecu)).toEqual([
        'REC-000001',
        'REC-000002',
      ]);
      for (const p of payments) {
        expect(p).toMatchObject({
          modePaiement: 'VIREMENT',
          statut: 'VALIDE',
          origine: 'APPLICATION',
          recuParUserId: secretary.id,
          fraisService: 0,
        });
        expect(p.referenceExterne).toBeTruthy();
        expect(p.dateOperation?.toISOString().slice(0, 10)).toBe(today);
        // La date du paiement est celle de la validation (c'est elle qui compte en clôture).
        expect(Math.abs(p.datePaiement.getTime() - Date.now())).toBeLessThan(
          60_000,
        );
      }
      expect(payments.map((p) => p.montant).sort((a, b) => a - b)).toEqual([
        45000, 90000,
      ]);
      const lines = await prisma.bankPaymentClaimLine.findMany({
        where: { claimId: claim.id },
      });
      expect(
        lines.every((l) => l.paymentId && l.montantValide === l.montantDeclare),
      ).toBe(true);
      // Les soldes baissent, la solvabilité suit.
      const status = (
        await get(`/students/${f.alice.id}/financial-status`).expect(200)
      ).body;
      expect(status.montantPaye).toBe(90000);
    });

    it('celui qui a confirmé ou déclaré ne valide pas : une autre personne le fait', async () => {
      const f = await ready();
      const { claim, pro } = await confirmed(f);
      await post(`/bank-payments/${claim.id}/validate`, {}, pro.token).expect(
        403,
      );
      expect(await prisma.payment.count()).toBe(0);

      // Déclarée par la secrétaire (pour une famille), confirmée par le Promoteur : elle ne valide pas la sienne.
      const secretary = await userToken(
        'SECRETAIRE_CAISSIER',
        'sec@test.local',
      );
      const own = (
        await staffDeclare(
          secretary.token,
          payload(
            f,
            [{ trancheId: f.aliceInscription.trancheId, montant: 10000 }],
            {
              guardianId: f.moukala.id,
              methode: 'CHEQUE',
              compteId: undefined,
            },
          ),
        ).expect(201)
      ).body;
      await post(
        `/bank-payments/${own.id}/confirm`,
        confirmBody(10000),
        pro.token,
      ).expect(201);
      await post(
        `/bank-payments/${own.id}/validate`,
        {},
        secretary.token,
      ).expect(403);
      // L'Administrateur (PAYMENT_CREATE) le peut.
      await post(`/bank-payments/${own.id}/validate`, {}).expect(201);
    });

    it('deux validations simultanées : une seule crée les paiements', async () => {
      const f = await ready();
      const { claim } = await confirmed(f);
      const results = await Promise.all([
        post(`/bank-payments/${claim.id}/validate`, {}),
        post(`/bank-payments/${claim.id}/validate`, {}),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.payment.count()).toBe(2);
    });

    it('le total imputé ne dépasse jamais le crédit confirmé', async () => {
      const f = await ready();
      const { claim } = await confirmed(f, 100000);
      // 135 000 déclarés par défaut contre 100 000 crédités.
      await post(`/bank-payments/${claim.id}/validate`, {}).expect(400);
      // En n'imputant que 100 000, rien ne reste.
      await post(`/bank-payments/${claim.id}/validate`, {
        allocations: [
          { trancheId: f.aliceScolarite.trancheId, montant: 90000 },
          { trancheId: f.briceInscription.trancheId, montant: 10000 },
        ],
      }).expect(201);
      expect(await prisma.payment.count()).toBe(2);
    });

    it('un crédit non imputé devient un excédent à rembourser hors application : motif obligatoire, puis clôture par le Promoteur', async () => {
      const f = await ready();
      const { claim, pro } = await confirmed(f, 140000);
      // 5 000 crédités en plus : le motif est exigé.
      await post(`/bank-payments/${claim.id}/validate`, {}).expect(400);
      const res = await post(`/bank-payments/${claim.id}/validate`, {
        motifExcedent: 'Le parent a versé 5 000 de trop, à lui rendre.',
      }).expect(201);
      expect(res.body).toMatchObject({ excedent: 5000, excedentRegle: false });
      const summary = (await get('/bank-payments/summary').expect(200)).body;
      expect(summary.excedentsAregler).toEqual({ count: 1, total: 5000 });
      const list = (await get('/bank-payments?statut=EXCEDENT').expect(200))
        .body;
      expect(list).toHaveLength(1);
      // Le parent est prévenu de l'excédent.
      const mine = (
        await get('/portal/bank-payments', f.moukalaToken).expect(200)
      ).body;
      expect(mine[0]).toMatchObject({ statut: 'VALIDE', excedent: 5000 });

      const secretary = await userToken(
        'SECRETAIRE_CAISSIER',
        'sec@test.local',
      );
      await post(
        `/bank-payments/${claim.id}/resolve-surplus`,
        { motif: 'Rendu en espèces' },
        secretary.token,
      ).expect(403);
      await post(
        `/bank-payments/${claim.id}/resolve-surplus`,
        { motif: 'Rendu en espèces' },
        pro.token,
      ).expect(201);
      await post(
        `/bank-payments/${claim.id}/resolve-surplus`,
        { motif: 'Encore' },
        pro.token,
      ).expect(409);
      expect(
        (await get('/bank-payments/summary').expect(200)).body.excedentsAregler
          .count,
      ).toBe(0);
    });

    it('un paiement au guichet entre-temps : valider au montant déclaré est refusé, on baisse l’imputation et le reste devient un excédent', async () => {
      const f = await ready();
      const { claim } = await confirmed(f);
      const line = await prisma.invoiceLine.findUniqueOrThrow({
        where: { id: f.briceInscription.trancheId },
      });
      // Le secrétariat encaisse 40 000 des 45 000 de l'inscription de Brice.
      await post('/payments', {
        invoiceLineId: line.id,
        montant: 40000,
      }).expect(201);
      const refused = await post(
        `/bank-payments/${claim.id}/validate`,
        {},
      ).expect(409);
      expect(JSON.stringify(refused.body)).toContain('5000');
      // Rien n'a été créé par la tentative refusée (même pas un numéro de reçu).
      expect(await prisma.payment.count()).toBe(1);
      const seq = await prisma.numberSequence.findFirstOrThrow({
        where: { type: 'RECEIPT' },
      });
      expect(seq.dernierNumero).toBe(1);

      await post(`/bank-payments/${claim.id}/validate`, {
        allocations: [
          { trancheId: f.aliceScolarite.trancheId, montant: 90000 },
          { trancheId: f.briceInscription.trancheId, montant: 5000 },
        ],
        motifExcedent: '40 000 déjà encaissés au guichet : 40 000 à rendre.',
      }).expect(201);
      expect(await prisma.payment.count()).toBe(3);
    });

    it('une tranche à zéro n’est pas imputée ; rien à imputer du tout est refusé', async () => {
      const f = await ready();
      const { claim } = await confirmed(f);
      await post(`/bank-payments/${claim.id}/validate`, {
        allocations: [],
      }).expect(400);
      await post(`/bank-payments/${claim.id}/validate`, {
        allocations: [{ trancheId: 'inconnue', montant: 1000 }],
      }).expect(400);
    });
  });

  describe('refus', () => {
    it('le secrétariat refuse avec un motif que le parent lit, et la même opération peut être déclarée de nouveau', async () => {
      const f = await ready();
      const secretary = await userToken(
        'SECRETAIRE_CAISSIER',
        'sec@test.local',
      );
      const first = payload(f, [
        { trancheId: f.aliceInscription.trancheId, montant: 20000 },
      ]);
      const claim = (await portalDeclare(f.moukalaToken, first).expect(201))
        .body;
      await post(
        `/bank-payments/${claim.id}/reject`,
        { motif: 'x' },
        secretary.token,
      ).expect(400);
      await post(
        `/bank-payments/${claim.id}/reject`,
        { motif: 'La preuve est illisible.' },
        secretary.token,
      ).expect(201);
      const mine = (
        await get('/portal/bank-payments', f.moukalaToken).expect(200)
      ).body;
      expect(mine[0]).toMatchObject({
        statut: 'REJETE',
        motifRejet: 'La preuve est illisible.',
      });
      // Refusée : la référence est de nouveau libre et la réservation rendue.
      await portalDeclare(f.moukalaToken, first).expect(201);
      expect(await prisma.payment.count()).toBe(0);
    });

    it('une déclaration validée ne se refuse plus ; l’Auditeur et le Comptable ne refusent pas', async () => {
      const f = await ready();
      const claim = await declareStandard(f);
      const pro = await promoter();
      await post(
        `/bank-payments/${claim.id}/confirm`,
        confirmBody(),
        pro.token,
      ).expect(201);
      await post(`/bank-payments/${claim.id}/validate`, {}).expect(201);
      await post(
        `/bank-payments/${claim.id}/reject`,
        { motif: 'Trop tard' },
        pro.token,
      ).expect(409);
      const accountant = await userToken('COMPTABLE', 'compta@test.local');
      await post(
        `/bank-payments/${claim.id}/reject`,
        { motif: 'Non' },
        accountant.token,
      ).expect(403);
    });
  });

  describe('déclaration par le secrétariat pour une famille', () => {
    it('un chèque remis à l’école : même circuit, la famille le voit dans son espace', async () => {
      const f = await ready();
      const secretary = await userToken(
        'SECRETAIRE_CAISSIER',
        'sec@test.local',
      );
      const cheque = (
        await staffDeclare(
          secretary.token,
          payload(
            f,
            [{ trancheId: f.aliceInscription.trancheId, montant: 45000 }],
            {
              guardianId: f.moukala.id,
              methode: 'CHEQUE',
              compteId: undefined,
              referenceOperation: 'CHQ-0042',
              banque: 'UBA',
            },
          ),
        ).expect(201)
      ).body;
      expect(cheque).toMatchObject({
        statut: 'EN_ATTENTE',
        methode: 'CHEQUE',
        declarant: { type: 'PERSONNEL' },
      });
      const mine = (
        await get('/portal/bank-payments', f.moukalaToken).expect(200)
      ).body;
      expect(mine).toHaveLength(1);
      // Une autre famille ne la voit pas.
      expect(
        (await get('/portal/bank-payments', f.zolaToken).expect(200)).body,
      ).toEqual([]);

      const pro = await promoter();
      await post(
        `/bank-payments/${cheque.id}/confirm`,
        confirmBody(45000),
        pro.token,
      ).expect(201);
      await post(`/bank-payments/${cheque.id}/validate`, {}).expect(201);
      const payment = await prisma.payment.findFirstOrThrow();
      expect(payment.modePaiement).toBe('CHEQUE');
    });

    it('il faut PAYMENT_CREATE pour déclarer pour le compte d’une famille, FINANCE_READ pour lire', async () => {
      const f = await ready();
      const accountant = await userToken('COMPTABLE', 'compta@test.local');
      await staffDeclare(
        accountant.token,
        payload(f, [
          { trancheId: f.aliceInscription.trancheId, montant: 1000 },
        ]),
      ).expect(403);
      await get('/bank-payments', accountant.token).expect(200);
      const teacher = await userToken('ENSEIGNANT', 'ens@test.local').catch(
        () => null,
      );
      if (teacher) await get('/bank-payments', teacher.token).expect(403);
    });

    it('le contexte d’un élève pour le secrétariat donne ses tranches payables', async () => {
      const f = await ready();
      const ctx = (
        await get(`/bank-payments/student-context/${f.alice.id}`).expect(200)
      ).body;
      expect(ctx.tranches).toHaveLength(2);
      await get('/bank-payments/student-context/inconnu').expect(404);
    });
  });

  describe('preuves', () => {
    it('une preuve ne se lit que par sa route protégée, chaque lecture est journalisée', async () => {
      const f = await ready();
      const claim = await declareStandard(f);
      const proof = await prisma.bankPaymentProof.findFirstOrThrow({
        where: { claimId: claim.id },
      });
      const secretary = await userToken(
        'SECRETAIRE_CAISSIER',
        'sec@test.local',
      );
      const ok = await get(
        `/bank-payments/${claim.id}/proofs/${proof.id}`,
        secretary.token,
      ).expect(200);
      expect(ok.headers['content-type']).toContain('application/pdf');
      expect(ok.headers['cache-control']).toContain('no-store');
      expect(ok.headers['x-content-type-options']).toBe('nosniff');
      await request(app.getHttpServer())
        .get(`/bank-payments/${claim.id}/proofs/${proof.id}`)
        .expect(401);
      await get(
        `/bank-payments/${claim.id}/proofs/${proof.id}`,
        f.moukalaToken,
      ).expect(401);
      await get(
        `/bank-payments/${claim.id}/proofs/inconnue`,
        secretary.token,
      ).expect(404);
      expect(
        await prisma.auditLog.count({
          where: { action: 'BANK_PAYMENT_PROOF_READ' },
        }),
      ).toBe(1);
    });

    it('jusqu’à trois pièces, jamais le même fichier deux fois', async () => {
      const f = await ready();
      const lignes = [
        { trancheId: f.aliceInscription.trancheId, montant: 1000 },
      ];
      await portalDeclare(f.moukalaToken, payload(f, lignes), {
        files: 4,
      }).expect(400);
      const same = uniqueProof();
      await portalDeclare(f.moukalaToken, payload(f, lignes), {
        proofs: [same, same],
      }).expect(400);
      await portalDeclare(f.moukalaToken, payload(f, lignes), {
        files: 3,
      }).expect(201);
    });
  });

  describe('comptabilité', () => {
    it('un virement validé entre dans la clôture du jour de la validation, jamais dans les espèces en caisse', async () => {
      const f = await ready();
      const claim = await declareStandard(f);
      const pro = await promoter();
      await post(
        `/bank-payments/${claim.id}/confirm`,
        confirmBody(),
        pro.token,
      ).expect(201);
      await post(`/bank-payments/${claim.id}/validate`, {}).expect(201);
      const closing = (
        await get(`/reports/cash-closing?date=${today}`).expect(200)
      ).body;
      expect(closing.entrees.total).toBe(135000);
      expect(closing.entrees.parMode).toMatchObject({
        ESPECES: 0,
        MOBILE_MONEY: 0,
        VIREMENT: 135000,
        DEPOT_BANCAIRE: 0,
        CHEQUE: 0,
      });
      expect(closing.especes.enCaisse).toBe(0);
      // Le tableau de bord compte l'année active.
      const year = await prisma.academicYear.findFirstOrThrow();
      await post(`/academic-years/${year.id}/activate`, {}).expect(201);
      const dash = (await get('/reports/dashboard').expect(200)).body;
      expect(dash.paiements.parMode.VIREMENT).toBe(135000);
    });

    it('le reçu du parent porte le mode et la référence ; la Direction annule comme un autre paiement', async () => {
      const f = await ready();
      const claim = await declareStandard(f, { methode: 'DEPOT_BANCAIRE' });
      const pro = await promoter();
      await post(
        `/bank-payments/${claim.id}/confirm`,
        confirmBody(),
        pro.token,
      ).expect(201);
      await post(`/bank-payments/${claim.id}/validate`, {}).expect(201);
      const payment = await prisma.payment.findFirstOrThrow({
        where: { invoiceLineId: f.aliceScolarite.trancheId },
      });
      const receipt = (
        await get(
          `/portal/children/${f.alice.id}/payments/${payment.id}/receipt`,
          f.moukalaToken,
        ).expect(200)
      ).body;
      expect(receipt).toMatchObject({
        modePaiement: 'DEPOT_BANCAIRE',
        montant: 90000,
        fraisService: 0,
      });
      expect(receipt.referenceExterne).toBeTruthy();
      // Un chèque revenu impayé : le paiement s'annule par la procédure habituelle (celui qui a validé ne l'annule pas).
      await post(
        `/payments/${payment.id}/cancel`,
        { motif: 'Chèque impayé' },
        pro.token,
      ).expect(201);
      const status = (
        await get(`/students/${f.alice.id}/financial-status`).expect(200)
      ).body;
      expect(status.montantPaye).toBe(0);
    });

    it('au guichet, seuls espèces et Mobile Money s’encaissent : un virement ne s’enregistre pas sans preuve ni contrôle', async () => {
      const f = await ready();
      for (const mode of ['VIREMENT', 'DEPOT_BANCAIRE', 'CHEQUE']) {
        await post('/payments', {
          invoiceLineId: f.aliceInscription.trancheId,
          montant: 1000,
          modePaiement: mode,
          referenceExterne: 'X',
        }).expect(400);
      }
      expect(await prisma.payment.count()).toBe(0);
    });

    it('le journal retient les étapes sans jamais la référence de l’opération, le numéro de compte ni un nom de fichier', async () => {
      const f = await ready();
      const reference = 'REF-SECRETE-98765';
      const claim = (
        await portalDeclare(
          f.moukalaToken,
          payload(
            f,
            [{ trancheId: f.aliceInscription.trancheId, montant: 45000 }],
            {
              referenceOperation: reference,
            },
          ),
        ).expect(201)
      ).body;
      const pro = await promoter();
      await post(
        `/bank-payments/${claim.id}/confirm`,
        confirmBody(45000),
        pro.token,
      ).expect(201);
      await post(`/bank-payments/${claim.id}/validate`, {}).expect(201);
      const logs = await prisma.auditLog.findMany({
        where: { action: { startsWith: 'BANK_PAYMENT' } },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual([
        'BANK_PAYMENT_DECLARE',
        'BANK_PAYMENT_CONFIRM',
        'BANK_PAYMENT_VALIDATE',
      ]);
      const text = JSON.stringify(logs);
      expect(text).not.toContain(reference);
      expect(text).not.toContain('12345678901');
      expect(text).not.toContain('.pdf');
    });
  });

  describe('migration des droits', () => {
    it('BANK_PAYMENT_CONFIRM n’est donné qu’au rôle PRO, rejouée sans effet de bord', async () => {
      await prisma.rolePermission.deleteMany({
        where: { permission: { code: 'BANK_PAYMENT_CONFIRM' } },
      });
      await prisma.permission.deleteMany({
        where: { code: 'BANK_PAYMENT_CONFIRM' },
      });
      await prisma.role.create({
        data: { code: 'PRO', nom: 'Promoteur', description: 't' },
      });
      const sql = readFileSync(
        join(
          __dirname,
          '../prisma/migrations/20261014090000_paiement_banque/migration.sql',
        ),
        'utf8',
      );
      const statements = sql
        .split(/;\s*\n/)
        .map((x) =>
          x
            .split('\n')
            .filter((l) => !l.trim().startsWith('--'))
            .join('\n')
            .trim(),
        )
        .filter((x) => x.startsWith('INSERT'));
      expect(statements.length).toBe(2);
      for (let i = 0; i < 2; i++)
        for (const st of statements) await prisma.$executeRawUnsafe(st);
      const holders = (
        await prisma.rolePermission.findMany({
          where: { permission: { code: 'BANK_PAYMENT_CONFIRM' } },
          include: { role: true },
        })
      ).map((rp) => rp.role.code);
      expect(holders).toEqual(['PRO']);
    });
  });
});

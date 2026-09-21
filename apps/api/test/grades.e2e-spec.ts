import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays } from '../src/timetable/timetable.util';

/**
 * Lot 15 : notes, évaluations et bulletins. Jeu de données calculé à la main :
 * Mathématiques (coefficient 2 pour le niveau) : devoir 1 sur 20 (coef 1), devoir 2 sur 10 (coef 2) ;
 * Français (coefficient 1) : un devoir sur 20.
 *   Alice : maths (12 x 1 + 16 x 2) / 3 = 14,67 ; français 10 ; générale (14,67 x 2 + 10) / 3 = 13,11
 *   Brice : maths (8 + 10 x 2) / 3 = 9,33 ; français 14 ; générale 10,89
 *   Carine : maths (16 + 20 x 2) / 3 = 18,67 ; français 12 ; générale 16,45
 *   Diane : absente au devoir 1, donc maths 12 (16/20 x ... = 6/10 = 12/20) ; français 18 ; générale 14,00
 * Rangs : Carine 1, Diane 2, Alice 3, Brice 4. Moyenne de la classe : 13,61.
 */
describe('Notes, évaluations et bulletins (e2e, Lot 15)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;

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
    admin = await login('admin@shakespeareacademy.cg', 'ChangeMe123!');
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

  const get = (path: string, t: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const post = (path: string, t: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const put = (path: string, t: string, body: object) =>
    request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const patch = (path: string, t: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const del = (path: string, t: string) =>
    request(app.getHttpServer())
      .delete(path)
      .set('Authorization', `Bearer ${t}`);

  async function account(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      sch.id,
      roleCode,
      { email },
    );
    return { user, token: await login(user.email, motDePasse) };
  }

  /** Une année active, un trimestre, deux classes, trois matières, deux enseignants avec compte, quatre élèves. */
  async function setup() {
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
    const year = (
      await post('/academic-years', admin, {
        libelle: '2026-2027',
        dateDebut: addDays(today, -120),
        dateFin: addDays(today, 200),
      })
    ).body;
    await post(`/academic-years/${year.id}/activate`, admin).expect(201);
    const term = (
      await post('/terms', admin, {
        academicYearId: year.id,
        libelle: 'Trimestre 1',
        dateDebut: addDays(today, -100),
        dateFin: addDays(today, 60),
      })
    ).body;
    const classA = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 A',
      })
    ).body;
    const classB = (
      await post('/classes', admin, {
        levelId: level.id,
        academicYearId: year.id,
        nom: 'CM2 B',
      })
    ).body;

    const math = (
      await post('/subjects', admin, { code: 'MATH', nom: 'Mathématiques' })
    ).body;
    const fran = (
      await post('/subjects', admin, { code: 'FRAN', nom: 'Français' })
    ).body;
    const scie = (
      await post('/subjects', admin, { code: 'SCIE', nom: 'Sciences' })
    ).body;
    await put(`/subjects/${math.id}/levels`, admin, {
      levels: [{ levelId: level.id, coefficient: 2 }],
    }).expect(200);
    await put(`/subjects/${fran.id}/levels`, admin, {
      levels: [{ levelId: level.id }],
    }).expect(200);
    await put(`/subjects/${scie.id}/levels`, admin, {
      levels: [{ levelId: level.id }],
    }).expect(200);

    const t1 = (
      await post('/teachers', admin, { nom: 'Ngoma', prenom: 'Paul' })
    ).body;
    const t2 = (
      await post('/teachers', admin, { nom: 'Okemba', prenom: 'Jean' })
    ).body;
    await post('/assignments', admin, {
      classId: classA.id,
      subjectId: math.id,
      teacherId: t1.id,
    }).expect(201);
    await post('/assignments', admin, {
      classId: classA.id,
      subjectId: fran.id,
      teacherId: t2.id,
    }).expect(201);
    await post('/assignments', admin, {
      classId: classB.id,
      subjectId: math.id,
      teacherId: t2.id,
    }).expect(201);

    const feeType = (
      await post('/fee-types', admin, {
        code: 'INSCRIPTION',
        nom: "Frais d'inscription",
        obligatoire: true,
        avecTranches: false,
      })
    ).body;
    await post('/fee-schedules', admin, {
      academicYearId: year.id,
      levelId: level.id,
      feeTypeId: feeType.id,
      montant: 45000,
    }).expect(201);
    const mk = async (
      nom: string,
      prenom: string,
      resp: { nom: string; prenom: string; telephone: string },
      classId: string,
    ) => {
      const student = (
        await post('/students', admin, {
          nom,
          prenom,
          sexe: 'F',
          dateNaissance: '2015-04-12',
          responsable: { ...resp, lien: 'Parent' },
        }).expect(201)
      ).body;
      await post('/enrollments', admin, {
        studentId: student.id,
        classId,
        academicYearId: year.id,
      }).expect(201);
      return student as { id: string; prenom: string };
    };
    const moukala = {
      nom: 'Moukala',
      prenom: 'Jean',
      telephone: PHONE_MOUKALA,
    };
    const zola = { nom: 'Zola', prenom: 'Marie', telephone: PHONE_ZOLA };
    const alice = await mk('Moukala', 'Alice', moukala, classA.id);
    const brice = await mk('Moukala', 'Brice', moukala, classA.id);
    const carine = await mk('Zola', 'Carine', zola, classA.id);
    const diane = await mk(
      'Nzila',
      'Diane',
      { nom: 'Nzila', prenom: 'Rose', telephone: '242060000009' },
      classA.id,
    );
    const eva = await mk(
      'Bakala',
      'Eva',
      { nom: 'Bakala', prenom: 'Luc', telephone: '242060000010' },
      classB.id,
    );

    const paul = await account('ENSEIGNANT', 'paul@test.local');
    const jean = await account('ENSEIGNANT', 'jean@test.local');
    await prisma.teacher.update({
      where: { id: t1.id },
      data: { userId: paul.user.id },
    });
    await prisma.teacher.update({
      where: { id: t2.id },
      data: { userId: jean.user.id },
    });
    const direction = await account('DIRECTION', 'direction@test.local');
    const guardians = await prisma.guardian.findMany();
    const guardianOf = (tel: string) =>
      guardians.find((g) => g.telephone === tel)!;
    return {
      section,
      level,
      year,
      term,
      classA,
      classB,
      math,
      fran,
      scie,
      t1,
      t2,
      alice,
      brice,
      carine,
      diane,
      eva,
      paul,
      jean,
      direction,
      moukala: guardianOf(PHONE_MOUKALA),
      zola: guardianOf(PHONE_ZOLA),
    };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;

  /** Crée les trois évaluations et saisit les notes du jeu de données. */
  async function fillNotes(s: Setup) {
    const e1 = (
      await post('/grades/evaluations', s.paul.token, {
        termId: s.term.id,
        classId: s.classA.id,
        subjectId: s.math.id,
        titre: 'Devoir 1',
        date: today,
        bareme: 20,
        coefficient: 1,
      }).expect(201)
    ).body;
    const e2 = (
      await post('/grades/evaluations', s.paul.token, {
        termId: s.term.id,
        classId: s.classA.id,
        subjectId: s.math.id,
        titre: 'Devoir 2',
        date: today,
        bareme: 10,
        coefficient: 2,
      }).expect(201)
    ).body;
    const e3 = (
      await post('/grades/evaluations', s.jean.token, {
        termId: s.term.id,
        classId: s.classA.id,
        subjectId: s.fran.id,
        titre: 'Dictée',
        date: today,
        bareme: 20,
      }).expect(201)
    ).body;
    await post(`/grades/evaluations/${e1.id}/notes`, s.paul.token, {
      notes: [
        { studentId: s.alice.id, statut: 'NOTE', valeur: 12 },
        { studentId: s.brice.id, statut: 'NOTE', valeur: 8 },
        { studentId: s.carine.id, statut: 'NOTE', valeur: 16 },
        { studentId: s.diane.id, statut: 'ABSENT' },
      ],
    }).expect(200);
    await post(`/grades/evaluations/${e2.id}/notes`, s.paul.token, {
      notes: [
        { studentId: s.alice.id, statut: 'NOTE', valeur: 8 },
        { studentId: s.brice.id, statut: 'NOTE', valeur: 5 },
        { studentId: s.carine.id, statut: 'NOTE', valeur: 10 },
        { studentId: s.diane.id, statut: 'NOTE', valeur: 6 },
      ],
    }).expect(200);
    await post(`/grades/evaluations/${e3.id}/notes`, s.jean.token, {
      notes: [
        { studentId: s.alice.id, statut: 'NOTE', valeur: 10 },
        { studentId: s.brice.id, statut: 'NOTE', valeur: 14 },
        { studentId: s.carine.id, statut: 'NOTE', valeur: 12 },
        { studentId: s.diane.id, statut: 'NOTE', valeur: 18 },
      ],
    }).expect(200);
    return { e1, e2, e3 };
  }

  const ref = (s: Setup) => ({ termId: s.term.id, classId: s.classA.id });

  // ------------------------------------------------------------------ Saisie et portée

  describe('évaluations et saisie', () => {
    it('un enseignant crée une évaluation pour SA matière, avec le barème par défaut de l’école', async () => {
      const s = await setup();
      const res = await post('/grades/evaluations', s.paul.token, {
        termId: s.term.id,
        classId: s.classA.id,
        subjectId: s.math.id,
        titre: 'Interrogation',
        date: today,
      }).expect(201);
      expect(res.body).toMatchObject({
        titre: 'Interrogation',
        bareme: 20,
        coefficient: 1,
        subjectName: 'Mathématiques',
      });
      expect(
        await prisma.auditLog.count({
          where: { action: 'GRADE_EVALUATION_CREATE' },
        }),
      ).toBe(1);
    });

    it('refuse la matière d’un collègue, une matière sans enseignant affecté, et un compte sans fiche enseignant', async () => {
      const s = await setup();
      const body = {
        termId: s.term.id,
        classId: s.classA.id,
        titre: 'X',
        date: today,
      };
      // Paul n'est pas l'enseignant de français en CM2 A, ni de mathématiques en CM2 B.
      await post('/grades/evaluations', s.paul.token, {
        ...body,
        subjectId: s.fran.id,
      }).expect(403);
      await post('/grades/evaluations', s.paul.token, {
        ...body,
        classId: s.classB.id,
        subjectId: s.math.id,
      }).expect(403);
      // Sciences : aucun enseignant affecté.
      await post('/grades/evaluations', s.paul.token, {
        ...body,
        subjectId: s.scie.id,
      }).expect(422);
      const orphan = await account('ENSEIGNANT', 'orphelin@test.local');
      await post('/grades/evaluations', orphan.token, {
        ...body,
        subjectId: s.math.id,
      }).expect(403);
      await get('/grades/context', orphan.token).expect(403);
      expect(await prisma.evaluation.count()).toBe(0);
    });

    it('un trimestre d’une autre année est refusé', async () => {
      const s = await setup();
      const other = (
        await post('/academic-years', admin, {
          libelle: '2027-2028',
          dateDebut: addDays(today, 300),
          dateFin: addDays(today, 500),
        })
      ).body;
      const otherTerm = (
        await post('/terms', admin, {
          academicYearId: other.id,
          libelle: 'T1',
          dateDebut: addDays(today, 301),
          dateFin: addDays(today, 400),
        })
      ).body;
      await post('/grades/evaluations', s.paul.token, {
        termId: otherTerm.id,
        classId: s.classA.id,
        subjectId: s.math.id,
        titre: 'X',
        date: today,
      }).expect(422);
    });

    it('valide chaque note : barème, décimales, statut, élève de la classe, doublon', async () => {
      const s = await setup();
      const ev = (
        await post('/grades/evaluations', s.paul.token, {
          termId: s.term.id,
          classId: s.classA.id,
          subjectId: s.math.id,
          titre: 'D',
          date: today,
          bareme: 20,
        }).expect(201)
      ).body;
      const save = (notes: object[]) =>
        post(`/grades/evaluations/${ev.id}/notes`, s.paul.token, { notes });

      await save([
        { studentId: s.alice.id, statut: 'NOTE', valeur: 20.5 },
      ]).expect(422); // au-dessus du barème
      await save([
        { studentId: s.alice.id, statut: 'NOTE', valeur: -1 },
      ]).expect(400);
      await save([
        { studentId: s.alice.id, statut: 'NOTE', valeur: 12.345 },
      ]).expect(400); // 3 décimales
      await save([{ studentId: s.alice.id, statut: 'NOTE' }]).expect(422); // note sans valeur
      await save([
        { studentId: s.alice.id, statut: 'ABSENT', valeur: 5 },
      ]).expect(422); // valeur pour un absent
      await save([{ studentId: s.eva.id, statut: 'NOTE', valeur: 10 }]).expect(
        422,
      ); // élève d'une autre classe
      await save([
        { studentId: s.alice.id, statut: 'NOTE', valeur: 10 },
        { studentId: s.alice.id, statut: 'NOTE', valeur: 11 },
      ]).expect(400); // doublon
      await save([{ studentId: s.alice.id, statut: 'NOTE', valeur: 0 }]).expect(
        200,
      ); // un vrai zéro est une note
      expect(await prisma.grade.count({ where: { evaluationId: ev.id } })).toBe(
        1,
      );
    });

    it('renvoyer la même feuille ne change rien, un élève absent de la liste garde sa note, AUCUNE efface', async () => {
      const s = await setup();
      const ev = (
        await post('/grades/evaluations', s.paul.token, {
          termId: s.term.id,
          classId: s.classA.id,
          subjectId: s.math.id,
          titre: 'D',
          date: today,
          bareme: 20,
        }).expect(201)
      ).body;
      const notes = [
        { studentId: s.alice.id, statut: 'NOTE', valeur: 12 },
        { studentId: s.brice.id, statut: 'NOTE', valeur: 8 },
      ];
      await post(`/grades/evaluations/${ev.id}/notes`, s.paul.token, {
        notes,
      }).expect(200);
      const audits = await prisma.auditLog.count({
        where: { action: 'GRADE_SHEET_SAVE' },
      });
      await post(`/grades/evaluations/${ev.id}/notes`, s.paul.token, {
        notes,
      }).expect(200);
      expect(
        await prisma.auditLog.count({ where: { action: 'GRADE_SHEET_SAVE' } }),
      ).toBe(audits); // rien n'a changé

      // Brice n'est pas dans la liste : sa note reste.
      await post(`/grades/evaluations/${ev.id}/notes`, s.paul.token, {
        notes: [{ studentId: s.alice.id, statut: 'AUCUNE' }],
      }).expect(200);
      const sheet = (
        await get(`/grades/evaluations/${ev.id}/sheet`, s.paul.token).expect(
          200,
        )
      ).body;
      const row = (id: string) =>
        sheet.eleves.find((e: { studentId: string }) => e.studentId === id);
      expect(row(s.alice.id)).toMatchObject({ statut: null, valeur: null });
      expect(row(s.brice.id)).toMatchObject({ statut: 'NOTE', valeur: 8 });
    });

    it('le journal ne contient jamais la valeur d’une note', async () => {
      const s = await setup();
      const ev = (
        await post('/grades/evaluations', s.paul.token, {
          termId: s.term.id,
          classId: s.classA.id,
          subjectId: s.math.id,
          titre: 'D',
          date: today,
          bareme: 20,
        }).expect(201)
      ).body;
      await post(`/grades/evaluations/${ev.id}/notes`, s.paul.token, {
        notes: [{ studentId: s.alice.id, statut: 'NOTE', valeur: 17.25 }],
      }).expect(200);
      const logs = await prisma.auditLog.findMany({
        where: { action: 'GRADE_SHEET_SAVE' },
      });
      expect(logs).toHaveLength(1);
      expect(JSON.stringify(logs[0])).not.toContain('17.25');
    });

    it('on ne réduit pas le barème sous une note déjà saisie ; une évaluation se modifie et se supprime tant que le trimestre est ouvert', async () => {
      const s = await setup();
      const ev = (
        await post('/grades/evaluations', s.paul.token, {
          termId: s.term.id,
          classId: s.classA.id,
          subjectId: s.math.id,
          titre: 'D',
          date: today,
          bareme: 20,
        }).expect(201)
      ).body;
      await post(`/grades/evaluations/${ev.id}/notes`, s.paul.token, {
        notes: [{ studentId: s.alice.id, statut: 'NOTE', valeur: 15 }],
      }).expect(200);
      await patch(`/grades/evaluations/${ev.id}`, s.paul.token, {
        bareme: 10,
      }).expect(422);
      await patch(`/grades/evaluations/${ev.id}`, s.paul.token, {
        titre: 'Devoir surveillé',
        coefficient: 3,
      }).expect(200);
      await del(`/grades/evaluations/${ev.id}`, s.jean.token).expect(403); // pas sa matière
      await del(`/grades/evaluations/${ev.id}`, s.paul.token).expect(200);
      expect(await prisma.grade.count()).toBe(0);
    });
  });

  // ------------------------------------------------------------------ Lecture et portée

  describe('lecture des notes et des résultats (RV12)', () => {
    it('un enseignant ne voit que ses évaluations, la Direction et l’Administrateur voient tout', async () => {
      const s = await setup();
      await fillNotes(s);
      const titles = async (t: string) =>
        (
          (await get('/grades/evaluations', t).expect(200)).body as Array<{
            titre: string;
          }>
        )
          .map((e) => e.titre)
          .sort();
      expect(await titles(s.paul.token)).toEqual(['Devoir 1', 'Devoir 2']);
      expect(await titles(s.jean.token)).toEqual(['Dictée']);
      expect(await titles(s.direction.token)).toEqual([
        'Devoir 1',
        'Devoir 2',
        'Dictée',
      ]);
      expect(await titles(admin)).toEqual(['Devoir 1', 'Devoir 2', 'Dictée']);
    });

    it('le surveillant, l’auditeur et le secrétariat n’ont aucun accès aux notes', async () => {
      const s = await setup();
      await fillNotes(s);
      for (const [role, email] of [
        ['SURVEILLANT', 'surv@test.local'],
        ['AUDITEUR', 'aud@test.local'],
        ['SECRETAIRE_CAISSIER', 'sec@test.local'],
        ['COMPTABLE', 'compta@test.local'],
      ]) {
        const a = await account(role, email);
        const res = await get('/grades/evaluations', a.token);
        expect({ role, status: res.status }).toEqual({ role, status: 403 });
        await get(
          `/grades/results?classId=${s.classA.id}&termId=${s.term.id}`,
          a.token,
        ).expect(403);
        await get(
          `/grades/bulletins?classId=${s.classA.id}&termId=${s.term.id}`,
          a.token,
        ).expect(403);
      }
    });

    it('lit la feuille d’une évaluation de sa matière seulement', async () => {
      const s = await setup();
      const { e1, e3 } = await fillNotes(s);
      await get(`/grades/evaluations/${e1.id}/sheet`, s.paul.token).expect(200);
      await get(`/grades/evaluations/${e3.id}/sheet`, s.paul.token).expect(403);
      await get(`/grades/evaluations/${e3.id}/sheet`, s.direction.token).expect(
        200,
      );
    });

    it('les résultats correspondent au calcul fait à la main : absent exclu, coefficients de la matière, rangs', async () => {
      const s = await setup();
      await fillNotes(s);
      const res = (
        await get(
          `/grades/results?classId=${s.classA.id}&termId=${s.term.id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      const byName = (n: string) =>
        res.eleves.find((e: { prenom: string }) => e.prenom === n);
      const subj = (n: string) =>
        res.matieres.find((m: { nom: string }) => m.nom === n).subjectId;
      const math = subj('Mathématiques');
      const fran = subj('Français');

      expect(byName('Alice').moyennes[math]).toBe(14.67);
      expect(byName('Brice').moyennes[math]).toBe(9.33);
      expect(byName('Carine').moyennes[math]).toBe(18.67);
      // Diane était absente au devoir 1 : sa moyenne ne compte que le devoir 2 (6/10 = 12/20), jamais un zéro.
      expect(byName('Diane').moyennes[math]).toBe(12);
      expect(byName('Alice').moyennes[fran]).toBe(10);

      expect(byName('Alice')).toMatchObject({
        moyenneGenerale: 13.11,
        rang: 3,
      });
      expect(byName('Brice')).toMatchObject({
        moyenneGenerale: 10.89,
        rang: 4,
      });
      expect(byName('Carine')).toMatchObject({
        moyenneGenerale: 16.45,
        rang: 1,
      });
      expect(byName('Diane')).toMatchObject({ moyenneGenerale: 14, rang: 2 });
      expect(res.statsGenerale).toEqual({
        moyenne: 13.61,
        min: 10.89,
        max: 16.45,
      });
      expect(res.complet).toBe(true);
      // Les coefficients viennent du niveau : 2 pour les mathématiques, 1 par défaut pour le français.
      expect(
        res.matieres.map((m: { nom: string; coefficient: number }) => [
          m.nom,
          m.coefficient,
        ]),
      ).toEqual([
        ['Français', 1],
        ['Mathématiques', 2],
      ]);
    });

    it('un enseignant ne voit que les colonnes de ses matières, sans moyenne générale ni rang', async () => {
      const s = await setup();
      await fillNotes(s);
      const res = (
        await get(
          `/grades/results?classId=${s.classA.id}&termId=${s.term.id}`,
          s.paul.token,
        ).expect(200)
      ).body;
      expect(res.matieres.map((m: { nom: string }) => m.nom)).toEqual([
        'Mathématiques',
      ]);
      expect(res.complet).toBe(false);
      expect(res.statsGenerale).toBeUndefined();
      for (const e of res.eleves) {
        expect(e.moyenneGenerale).toBeUndefined();
        expect(e.rang).toBeUndefined();
      }
      // Une classe où il n'enseigne rien lui est fermée.
      await get(
        `/grades/results?classId=${s.classB.id}&termId=${s.term.id}`,
        s.jean.token,
      ).expect(200);
      await get(
        `/grades/results?classId=${s.classB.id}&termId=${s.term.id}`,
        s.paul.token,
      ).expect(403);
    });

    it('un élève sans aucune note n’a pas de moyenne (jamais 0) et n’est pas classé', async () => {
      const s = await setup();
      const ev = (
        await post('/grades/evaluations', s.paul.token, {
          termId: s.term.id,
          classId: s.classA.id,
          subjectId: s.math.id,
          titre: 'D',
          date: today,
          bareme: 20,
        }).expect(201)
      ).body;
      await post(`/grades/evaluations/${ev.id}/notes`, s.paul.token, {
        notes: [{ studentId: s.alice.id, statut: 'NOTE', valeur: 12 }],
      }).expect(200);
      const res = (
        await get(
          `/grades/results?classId=${s.classA.id}&termId=${s.term.id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      const brice = res.eleves.find(
        (e: { prenom: string }) => e.prenom === 'Brice',
      );
      expect(brice.moyenneGenerale).toBeNull();
      expect(brice.rang).toBeNull();
    });

    it('les appréciations d’une matière ne se saisissent que pour ses élèves et sa matière', async () => {
      const s = await setup();
      const body = {
        termId: s.term.id,
        classId: s.classA.id,
        subjectId: s.math.id,
        items: [{ studentId: s.alice.id, texte: 'Très bon travail' }],
      };
      await put('/grades/appreciations', s.paul.token, body).expect(200);
      await put('/grades/appreciations', s.jean.token, body).expect(403);
      const list = (
        await get(
          `/grades/appreciations?termId=${s.term.id}&classId=${s.classA.id}&subjectId=${s.math.id}`,
          s.paul.token,
        ).expect(200)
      ).body;
      expect(list).toEqual([
        { studentId: s.alice.id, texte: 'Très bon travail' },
      ]);
      // Effacer.
      await put('/grades/appreciations', s.paul.token, {
        ...body,
        items: [{ studentId: s.alice.id, texte: '' }],
      }).expect(200);
      expect(await prisma.subjectAppreciation.count()).toBe(0);
      // Le journal ne garde pas le texte.
      const logs = await prisma.auditLog.findMany({
        where: { action: 'GRADE_APPRECIATIONS_SAVE' },
      });
      expect(JSON.stringify(logs)).not.toContain('Très bon travail');
    });
  });

  // ------------------------------------------------------------------ Validation, verrouillage, correction

  describe('validation, verrouillage et corrections', () => {
    it('seule la Direction valide : ni l’enseignant, ni l’Administrateur ; rien à valider sans évaluation', async () => {
      const s = await setup();
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        422,
      ); // aucune évaluation
      await fillNotes(s);
      await post('/grades/period/validate', s.paul.token, ref(s)).expect(403);
      await post('/grades/period/validate', admin, ref(s)).expect(403);
      const res = (
        await post('/grades/period/validate', s.direction.token, ref(s)).expect(
          201,
        )
      ).body;
      expect(res.statut).toBe('VALIDE');
      expect(res.bulletins).toBe(4);
    });

    it('la validation fige un instantané identique au calcul, avec rang et moyenne de la classe', async () => {
      const s = await setup();
      await fillNotes(s);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      const list = (
        await get(
          `/grades/bulletins?classId=${s.classA.id}&termId=${s.term.id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      expect(
        list.bulletins.map((b: { prenom: string; rang: number }) => [
          b.prenom,
          b.rang,
        ]),
      ).toEqual([
        ['Carine', 1],
        ['Diane', 2],
        ['Alice', 3],
        ['Brice', 4],
      ]);
      const alice = list.bulletins.find(
        (b: { prenom: string }) => b.prenom === 'Alice',
      );
      const detail = (
        await get(`/grades/bulletins/${alice.id}`, s.direction.token).expect(
          200,
        )
      ).body;
      expect(detail).toMatchObject({
        moyenneGenerale: 13.11,
        rang: 3,
        effectif: 4,
        moyenneClasse: 13.61,
        classe: { nom: 'CM2 A' },
      });
      expect(
        detail.matieres.map((m: { nom: string; moyenne: number }) => [
          m.nom,
          m.moyenne,
        ]),
      ).toEqual([
        ['Français', 10],
        ['Mathématiques', 14.67],
      ]);
    });

    it('après validation, l’enseignant ne saisit plus, ne crée plus et ne modifie plus rien', async () => {
      const s = await setup();
      const { e1 } = await fillNotes(s);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      const save = post(`/grades/evaluations/${e1.id}/notes`, s.paul.token, {
        notes: [{ studentId: s.alice.id, statut: 'NOTE', valeur: 19 }],
      });
      const res = await save;
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/seule la Direction/);
      await post('/grades/evaluations', s.paul.token, {
        termId: s.term.id,
        classId: s.classA.id,
        subjectId: s.math.id,
        titre: 'Tard',
        date: today,
      }).expect(409);
      await patch(`/grades/evaluations/${e1.id}`, s.paul.token, {
        titre: 'Autre',
      }).expect(409);
      await del(`/grades/evaluations/${e1.id}`, s.paul.token).expect(409);
      await put('/grades/appreciations', s.paul.token, {
        termId: s.term.id,
        classId: s.classA.id,
        subjectId: s.math.id,
        items: [{ studentId: s.alice.id, texte: 'x' }],
      }).expect(409);
    });

    it('la Direction corrige avec un motif, l’historique est gardé, et le bulletin figé ne bouge pas', async () => {
      const s = await setup();
      const { e1 } = await fillNotes(s);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      const list = (
        await get(
          `/grades/bulletins?classId=${s.classA.id}&termId=${s.term.id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      const alice = list.bulletins.find(
        (b: { prenom: string }) => b.prenom === 'Alice',
      );

      const fix = (motif?: string) =>
        post(`/grades/evaluations/${e1.id}/notes`, s.direction.token, {
          notes: [{ studentId: s.alice.id, statut: 'NOTE', valeur: 20 }],
          ...(motif ? { motif } : {}),
        });
      await fix().expect(422); // le motif est obligatoire
      await post(`/grades/evaluations/${e1.id}/notes`, s.direction.token, {
        notes: [{ studentId: s.alice.id, statut: 'AUCUNE' }],
        motif: 'Erreur de saisie',
      }).expect(422); // après validation on corrige, on n'efface pas
      await fix('Erreur de report de la note').expect(200);

      const corrections = await prisma.gradeCorrection.findMany();
      expect(corrections).toHaveLength(1);
      expect(corrections[0]).toMatchObject({
        ancienStatut: 'NOTE',
        nouveauStatut: 'NOTE',
        motif: 'Erreur de report de la note',
      });
      expect(Number(corrections[0].ancienneValeur)).toBe(12);
      expect(Number(corrections[0].nouvelleValeur)).toBe(20);
      const audit = await prisma.auditLog.findMany({
        where: { action: 'GRADE_CORRECT' },
      });
      expect(audit).toHaveLength(1);

      // Le bulletin figé n'a pas changé.
      const detail = (
        await get(`/grades/bulletins/${alice.id}`, s.direction.token).expect(
          200,
        )
      ).body;
      expect(detail.moyenneGenerale).toBe(13.11);
      const period = (
        await get(
          `/grades/period?classId=${s.classA.id}&termId=${s.term.id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      expect(period.correctionsDepuisValidation).toBe(1);

      // Il faut revalider pour que le bulletin en tienne compte : (20 + 16 x 2) / 3 = 17,33 ; général (17,33 x 2 + 10) / 3 = 14,89.
      await post('/grades/period/publish', s.direction.token, ref(s)).expect(
        409,
      );
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      const after = (
        await get(`/grades/bulletins/${alice.id}`, s.direction.token).expect(
          200,
        )
      ).body;
      expect(after.moyenneGenerale).toBe(14.89);
    });

    it('la Direction peut corriger, mais l’Administrateur ne le peut pas (GRADE_CORRECT réservé)', async () => {
      const s = await setup();
      const { e1 } = await fillNotes(s);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      const res = await post(`/grades/evaluations/${e1.id}/notes`, admin, {
        notes: [{ studentId: s.alice.id, statut: 'NOTE', valeur: 20 }],
        motif: 'Test',
      });
      expect(res.status).toBe(403);
    });

    it('rouvrir exige un motif, remet la saisie à l’enseignant et retire le bulletin publié', async () => {
      const s = await setup();
      const { e1 } = await fillNotes(s);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      await post('/grades/period/reopen', s.direction.token, {
        ...ref(s),
        motif: '',
      }).expect(400);
      await post('/grades/period/reopen', s.direction.token, {
        ...ref(s),
        motif: 'Un devoir a été oublié',
      }).expect(201);
      const period = (
        await get(
          `/grades/period?classId=${s.classA.id}&termId=${s.term.id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      expect(period).toMatchObject({
        statut: 'OUVERT',
        rouvertMotif: 'Un devoir a été oublié',
      });
      await post(`/grades/evaluations/${e1.id}/notes`, s.paul.token, {
        notes: [{ studentId: s.alice.id, statut: 'NOTE', valeur: 13 }],
      }).expect(200);
      // Un trimestre ouvert n'a plus de bulletin valable.
      const list = (
        await get(
          `/grades/bulletins?classId=${s.classA.id}&termId=${s.term.id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      expect(list.bulletins).toEqual([]);
      await post('/grades/period/reopen', s.direction.token, {
        ...ref(s),
        motif: 'Encore',
      }).expect(409); // déjà ouvert
    });

    it('on ne publie qu’un trimestre validé, et un trimestre publié doit être rouvert pour être revalidé', async () => {
      const s = await setup();
      await fillNotes(s);
      await post('/grades/period/publish', s.direction.token, ref(s)).expect(
        409,
      ); // pas validé
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      await post('/grades/period/publish', s.paul.token, ref(s)).expect(403);
      await post('/grades/period/publish', s.direction.token, ref(s)).expect(
        201,
      );
      // Déjà publié : rien à publier de nouveau.
      await post('/grades/period/publish', s.direction.token, ref(s)).expect(
        409,
      );
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        409,
      );
      // Rouvert, il n'est plus publiable tant qu'il n'est pas validé de nouveau.
      await post('/grades/period/reopen', s.direction.token, {
        ...ref(s),
        motif: 'Contrôle',
      }).expect(201);
      await post('/grades/period/publish', s.direction.token, ref(s)).expect(
        409,
      );
    });

    it('l’appréciation générale se saisit tant que le trimestre est validé, et se garde à la revalidation', async () => {
      const s = await setup();
      await fillNotes(s);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      const list = (
        await get(
          `/grades/bulletins?classId=${s.classA.id}&termId=${s.term.id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      const alice = list.bulletins.find(
        (b: { prenom: string }) => b.prenom === 'Alice',
      );
      await put(`/grades/bulletins/${alice.id}/appreciation`, s.paul.token, {
        texte: 'x',
      }).expect(403);
      await put(
        `/grades/bulletins/${alice.id}/appreciation`,
        s.direction.token,
        { texte: 'Élève sérieuse' },
      ).expect(200);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      const again = (
        await get(
          `/grades/bulletins?classId=${s.classA.id}&termId=${s.term.id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      expect(
        again.bulletins.find((b: { prenom: string }) => b.prenom === 'Alice')
          .appreciationGenerale,
      ).toBe('Élève sérieuse');
      await post('/grades/period/publish', s.direction.token, ref(s)).expect(
        201,
      );
      await put(
        `/grades/bulletins/${alice.id}/appreciation`,
        s.direction.token,
        { texte: 'Trop tard' },
      ).expect(409);
    });

    it('une année clôturée n’accepte plus de notes', async () => {
      const s = await setup();
      const { e1 } = await fillNotes(s);
      await prisma.academicYear.update({
        where: { id: s.year.id },
        data: { statut: 'CLOTUREE' },
      });
      await post(`/grades/evaluations/${e1.id}/notes`, s.paul.token, {
        notes: [{ studentId: s.alice.id, statut: 'NOTE', valeur: 13 }],
      }).expect(409);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        409,
      );
    });
  });

  // ------------------------------------------------------------------ Lettres, passage, paramètres

  describe('paramètres : lettres, moyenne de passage, rang', () => {
    it('sans tranche ni moyenne de passage, le bulletin n’affiche aucune lettre ni mention (rien d’inventé)', async () => {
      const s = await setup();
      await fillNotes(s);
      await put('/grades/settings', s.direction.token, {
        sections: [{ sectionId: s.section.id, affichageLettres: true }],
      }).expect(200);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      const list = (
        await get(
          `/grades/bulletins?classId=${s.classA.id}&termId=${s.term.id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      const detail = (
        await get(
          `/grades/bulletins/${list.bulletins[0].id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      expect(detail.lettre).toBeNull();
      expect(detail.admis).toBeNull();
    });

    it('avec des tranches et une moyenne de passage, les lettres et la mention sont figées dans le bulletin', async () => {
      const s = await setup();
      await fillNotes(s);
      await put('/grades/settings', s.direction.token, {
        moyennePassage: 12,
        bands: [
          { lettre: 'A', minimum: 16 },
          { lettre: 'B', minimum: 14 },
          { lettre: 'C', minimum: 12 },
          { lettre: 'D', minimum: 10 },
        ],
        sections: [{ sectionId: s.section.id, affichageLettres: true }],
      }).expect(200);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      const list = (
        await get(
          `/grades/bulletins?classId=${s.classA.id}&termId=${s.term.id}`,
          s.direction.token,
        ).expect(200)
      ).body;
      const of = async (prenom: string) => {
        const b = list.bulletins.find(
          (x: { prenom: string }) => x.prenom === prenom,
        );
        return (
          await get(`/grades/bulletins/${b.id}`, s.direction.token).expect(200)
        ).body;
      };
      expect(await of('Carine')).toMatchObject({
        moyenneGenerale: 16.45,
        lettre: 'A',
        admis: true,
      });
      expect(await of('Diane')).toMatchObject({
        moyenneGenerale: 14,
        lettre: 'B',
        admis: true,
      });
      expect(await of('Alice')).toMatchObject({
        moyenneGenerale: 13.11,
        lettre: 'C',
        admis: true,
      });
      expect(await of('Brice')).toMatchObject({
        moyenneGenerale: 10.89,
        lettre: 'D',
        admis: false,
      });
      // Changer les tranches ensuite ne modifie pas un bulletin déjà figé.
      await put('/grades/settings', s.direction.token, {
        bands: [{ lettre: 'A', minimum: 5 }],
      }).expect(200);
      expect(await of('Brice')).toMatchObject({ lettre: 'D' });
    });

    it('valide les tranches et réserve les paramètres à PEDAGOGY_MANAGE', async () => {
      const s = await setup();
      await put('/grades/settings', s.direction.token, {
        bands: [
          { lettre: 'A', minimum: 16 },
          { lettre: 'a', minimum: 14 },
        ],
      }).expect(400);
      await put('/grades/settings', s.direction.token, {
        bands: [
          { lettre: 'A', minimum: 16 },
          { lettre: 'B', minimum: 16 },
        ],
      }).expect(400);
      await put('/grades/settings', s.direction.token, {
        moyennePassage: 25,
      }).expect(400);
      await put('/grades/settings', s.paul.token, { baremeDefaut: 10 }).expect(
        403,
      );
      await get('/grades/settings', s.paul.token).expect(403);
      await put('/grades/settings', s.direction.token, {
        baremeDefaut: 10,
        moyennePassage: null,
      }).expect(200);
      const ev = await post('/grades/evaluations', s.paul.token, {
        termId: s.term.id,
        classId: s.classA.id,
        subjectId: s.math.id,
        titre: 'D',
        date: today,
      }).expect(201);
      expect(ev.body.bareme).toBe(10);
    });

    it('le coefficient d’une matière se règle par niveau et n’est pas remis à 1 quand on modifie les niveaux', async () => {
      const s = await setup();
      // Renvoyer les niveaux sans coefficient garde celui qui est enregistré.
      await put(`/subjects/${s.math.id}/levels`, admin, {
        levels: [{ levelId: s.level.id, minutesParSemaine: 120 }],
      }).expect(200);
      const row = await prisma.subjectLevel.findFirstOrThrow({
        where: { subjectId: s.math.id, levelId: s.level.id },
      });
      expect(row.coefficient).toBe(2);
      await put(`/subjects/${s.math.id}/levels`, admin, {
        levels: [{ levelId: s.level.id, coefficient: 5 }],
      }).expect(200);
      expect(
        (
          await prisma.subjectLevel.findFirstOrThrow({
            where: { subjectId: s.math.id },
          })
        ).coefficient,
      ).toBe(5);
    });
  });

  // ------------------------------------------------------------------ Parents

  describe('portail parent', () => {
    const portalGet = (path: string, t: string) =>
      request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${t}`);

    async function activeParent(guardianId: string, telephone: string) {
      const { body } = await post(
        `/parent-accounts/guardians/${guardianId}/activation-code`,
        admin,
      ).expect(201);
      const res = await request(app.getHttpServer())
        .post('/portal/activate')
        .send({
          telephone,
          code: body.code,
          motDePasse: 'MotDePasse123',
          consentement: true,
          versionPolitique: '2026-09-v3',
        })
        .expect(201);
      return res.body.accessToken as string;
    }

    it('un bulletin non publié est invisible du parent ; publié, il est visible sans rang par défaut', async () => {
      const s = await setup();
      await fillNotes(s);
      const parent = await activeParent(s.moukala.id, PHONE_MOUKALA);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      expect(
        (
          await portalGet(
            `/portal/children/${s.alice.id}/bulletins`,
            parent,
          ).expect(200)
        ).body,
      ).toEqual([]);

      await post('/grades/period/publish', s.direction.token, ref(s)).expect(
        201,
      );
      const list = (
        await portalGet(
          `/portal/children/${s.alice.id}/bulletins`,
          parent,
        ).expect(200)
      ).body;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        trimestre: 'Trimestre 1',
        classe: 'CM2 A',
        moyenneGenerale: 13.11,
      });

      const detail = (
        await portalGet(
          `/portal/children/${s.alice.id}/bulletins/${list[0].id}`,
          parent,
        ).expect(200)
      ).body;
      expect(detail.moyenneGenerale).toBe(13.11);
      expect(detail.matieres).toHaveLength(2);
      // Par défaut : ni le rang, ni l'effectif, ni les statistiques de la classe (à décider par la Direction).
      expect(detail.rang).toBeUndefined();
      expect(detail.effectif).toBeUndefined();
      expect(detail.moyenneClasse).toBeUndefined();
      expect(detail.matieres[0].moyenneClasse).toBeUndefined();

      // La Direction peut décider de les montrer.
      await put('/grades/settings', s.direction.token, {
        bulletinAfficheRang: true,
      }).expect(200);
      const shown = (
        await portalGet(
          `/portal/children/${s.alice.id}/bulletins/${list[0].id}`,
          parent,
        ).expect(200)
      ).body;
      expect(shown).toMatchObject({
        rang: 3,
        effectif: 4,
        moyenneClasse: 13.61,
      });
    });

    it('une famille ne voit que ses enfants : 404 pour un autre enfant ou un bulletin d’une autre famille', async () => {
      const s = await setup();
      await fillNotes(s);
      const moukala = await activeParent(s.moukala.id, PHONE_MOUKALA);
      const zola = await activeParent(s.zola.id, PHONE_ZOLA);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      await post('/grades/period/publish', s.direction.token, ref(s)).expect(
        201,
      );

      const aliceList = (
        await portalGet(
          `/portal/children/${s.alice.id}/bulletins`,
          moukala,
        ).expect(200)
      ).body;
      await portalGet(`/portal/children/${s.alice.id}/bulletins`, zola).expect(
        404,
      );
      await portalGet(
        `/portal/children/${s.carine.id}/bulletins`,
        moukala,
      ).expect(404);
      await portalGet(`/portal/children/inconnu/bulletins`, moukala).expect(
        404,
      );
      // Le bulletin d'Alice, demandé par la famille Zola pour SON enfant : 404 aussi.
      await portalGet(
        `/portal/children/${s.carine.id}/bulletins/${aliceList[0].id}`,
        zola,
      ).expect(404);
      await portalGet(
        `/portal/children/${s.alice.id}/bulletins/${aliceList[0].id}`,
        moukala,
      ).expect(200);
      // Un jeton du personnel n'ouvre pas le portail.
      await portalGet(
        `/portal/children/${s.alice.id}/bulletins`,
        s.direction.token,
      ).expect(401);
    });

    it('rouvrir un trimestre publié retire aussitôt les bulletins du portail', async () => {
      const s = await setup();
      await fillNotes(s);
      const parent = await activeParent(s.moukala.id, PHONE_MOUKALA);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      await post('/grades/period/publish', s.direction.token, ref(s)).expect(
        201,
      );
      const list = (
        await portalGet(
          `/portal/children/${s.alice.id}/bulletins`,
          parent,
        ).expect(200)
      ).body;
      expect(list).toHaveLength(1);
      await post('/grades/period/reopen', s.direction.token, {
        ...ref(s),
        motif: 'Erreur découverte',
      }).expect(201);
      expect(
        (
          await portalGet(
            `/portal/children/${s.alice.id}/bulletins`,
            parent,
          ).expect(200)
        ).body,
      ).toEqual([]);
      await portalGet(
        `/portal/children/${s.alice.id}/bulletins/${list[0].id}`,
        parent,
      ).expect(404);
    });

    it('la publication prévient les responsables sans jamais dire une note (RV10)', async () => {
      const s = await setup();
      await fillNotes(s);
      const parent = await activeParent(s.moukala.id, PHONE_MOUKALA);
      await post('/grades/period/validate', s.direction.token, ref(s)).expect(
        201,
      );
      await post('/grades/period/publish', s.direction.token, ref(s)).expect(
        201,
      );
      await app.get(NotificationsService).idle();
      const res = await portalGet('/portal/notifications', parent).expect(200);
      const items = res.body.notifications ?? res.body;
      const bulletins = (
        items as Array<{
          type: string;
          corps: string;
          enfant?: string;
          prenom?: string;
        }>
      ).filter((n) => n.type === 'BULLETIN_DISPONIBLE');
      expect(bulletins).toHaveLength(2); // Alice et Brice
      for (const n of bulletins) {
        expect(n.corps).toMatch(/bulletin/i);
        expect(n.corps).not.toMatch(/13[,.]11|10[,.]89|moyenne|rang/i);
      }
    });
  });

  // ------------------------------------------------------------------ Contexte et suppression

  describe('contexte de l’écran et suppression d’un élève/trimestre', () => {
    it('le contexte donne à l’enseignant ses classes et matières, à la Direction toutes les classes', async () => {
      const s = await setup();
      const paul = (await get('/grades/context', s.paul.token).expect(200))
        .body;
      expect(paul.annee.libelle).toBe('2026-2027');
      expect(paul.trimestres).toHaveLength(1);
      expect(paul.classes.map((c: { nom: string }) => c.nom)).toEqual([
        'CM2 A',
      ]);
      expect(
        paul.affectations.map((a: { subjectName: string }) => a.subjectName),
      ).toEqual(['Mathématiques']);
      const dir = (await get('/grades/context', s.direction.token).expect(200))
        .body;
      expect(dir.classes.map((c: { nom: string }) => c.nom).sort()).toEqual([
        'CM2 A',
        'CM2 B',
      ]);
      expect(dir.affectations).toHaveLength(3);
      expect(dir.parametres).toMatchObject({
        baremeDefaut: 20,
        moyennePassage: null,
        bulletinAfficheRang: false,
      });
    });
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';
import { cleanDatabase } from './utils/clean-database';
import { seedBaseFixtures, createUserWithRole } from './utils/fixtures';
import { addDays, weekdayOf } from '../src/timetable/timetable.util';

/**
 * Durcissement des rôles (audit du 21 septembre 2026) : 1) l'enseignant fait l'appel de SES séances seulement ;
 * 2) on ne s'accorde pas de droit réservé à la Direction ; 3) la lecture des finances est séparée de la lecture
 * des dossiers d'élèves ; 4) on n'approuve pas sa propre demande.
 */
describe('Durcissement des rôles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedBaseFixtures(prisma);
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

  const get = (path: string, t: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const post = (path: string, t: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const patch = (path: string, t: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);
  const put = (path: string, t: string, body: object) =>
    request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${t}`)
      .send(body);

  async function tokenFor(roleCode: string, email: string) {
    const sch = await prisma.school.findFirstOrThrow();
    const { user, motDePasse } = await createUserWithRole(
      prisma,
      sch.id,
      roleCode,
      { email },
    );
    return { user, token: await login(user.email, motDePasse) };
  }

  /** Rôle sur mesure (codes de permission donnés) et un compte qui le porte. */
  async function customToken(
    roleCode: string,
    permissions: string[],
    email: string,
  ) {
    const role = await prisma.role.create({
      data: { code: roleCode, nom: roleCode, description: 'test' },
    });
    const perms = await prisma.permission.findMany({
      where: { code: { in: permissions } },
    });
    expect(perms).toHaveLength(permissions.length);
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    return tokenFor(roleCode, email);
  }

  async function permissionsOf(roleCode: string): Promise<string[]> {
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: roleCode },
      include: { rolePermissions: { include: { permission: true } } },
    });
    return role.rolePermissions.map((rp) => rp.permission.code).sort();
  }

  // ------------------------------------------------------------------ 1. L'enseignant fait l'appel de ses séances

  describe("appel par l'enseignant", () => {
    /** Deux classes, deux enseignants, une séance chacun aujourd'hui, un élève par classe. */
    async function setup() {
      await patch('/pedagogy/settings', adminToken, {
        joursClasse: [0, 1, 2, 3, 4, 5, 6],
      }).expect(200);
      const section = (
        await post('/sections', adminToken, { code: 'FR', nom: 'Francophone' })
      ).body;
      const cycle = (
        await post('/cycles', adminToken, {
          sectionId: section.id,
          code: 'PRIM',
          nom: 'Primaire',
        })
      ).body;
      const level = (
        await post('/levels', adminToken, {
          cycleId: cycle.id,
          code: 'CM2',
          nom: 'CM2',
        })
      ).body;
      const year = (
        await post('/academic-years', adminToken, {
          libelle: '2026-2027',
          dateDebut: addDays(today, -120),
          dateFin: addDays(today, 200),
        })
      ).body;
      const classA = (
        await post('/classes', adminToken, {
          levelId: level.id,
          academicYearId: year.id,
          nom: 'CM2 A',
        })
      ).body;
      const classB = (
        await post('/classes', adminToken, {
          levelId: level.id,
          academicYearId: year.id,
          nom: 'CM2 B',
        })
      ).body;
      const h1 = (
        await post('/time-slots', adminToken, {
          libelle: 'H1',
          heureDebut: '08:00',
          heureFin: '08:50',
        })
      ).body;
      const h2 = (
        await post('/time-slots', adminToken, {
          libelle: 'H2',
          heureDebut: '09:00',
          heureFin: '09:50',
        })
      ).body;
      const math = (
        await post('/subjects', adminToken, {
          code: 'MATH',
          nom: 'Mathématiques',
        })
      ).body;
      await put(`/subjects/${math.id}/levels`, adminToken, {
        levels: [{ levelId: level.id }],
      }).expect(200);
      const t1 = (
        await post('/teachers', adminToken, { nom: 'Ngoma', prenom: 'Paul' })
      ).body;
      const t2 = (
        await post('/teachers', adminToken, { nom: 'Okemba', prenom: 'Jean' })
      ).body;
      await post('/assignments', adminToken, {
        classId: classA.id,
        subjectId: math.id,
        teacherId: t1.id,
      }).expect(201);
      await post('/assignments', adminToken, {
        classId: classB.id,
        subjectId: math.id,
        teacherId: t2.id,
      }).expect(201);
      const roomA = (await post('/rooms', adminToken, { nom: 'Salle A' })).body;
      const roomB = (await post('/rooms', adminToken, { nom: 'Salle B' })).body;
      const tt = (
        await post('/timetables', adminToken, {
          academicYearId: year.id,
        }).expect(201)
      ).body;
      const entryA = (
        await post(`/timetables/${tt.id}/entries`, adminToken, {
          classId: classA.id,
          subjectId: math.id,
          timeSlotId: h1.id,
          jourSemaine: weekdayOf(today),
          roomId: roomA.id,
        }).expect(201)
      ).body;
      const entryB = (
        await post(`/timetables/${tt.id}/entries`, adminToken, {
          classId: classB.id,
          subjectId: math.id,
          timeSlotId: h2.id,
          jourSemaine: weekdayOf(today),
          roomId: roomB.id,
        }).expect(201)
      ).body;
      await post(`/timetables/${tt.id}/publish`, adminToken, {
        dateEffet: addDays(today, -60),
      }).expect(201);

      const sch = await prisma.school.findFirstOrThrow();
      const mkStudent = async (
        nom: string,
        klass: { id: string },
        i: number,
      ) => {
        const student = await prisma.student.create({
          data: {
            schoolId: sch.id,
            matricule: `M${i}`,
            nom,
            prenom: 'Élève',
            sexe: 'M',
            dateNaissance: new Date('2015-01-01'),
          },
        });
        await prisma.enrollment.create({
          data: {
            schoolId: sch.id,
            studentId: student.id,
            classId: klass.id,
            academicYearId: year.id,
            numero: `INS-${i}`,
            type: 'INSCRIPTION',
          },
        });
        return student;
      };
      const sA = await mkStudent('Bakala', classA, 1);
      const sB = await mkStudent('Zola', classB, 2);

      // Le compte de l'enseignant Paul est relié à sa fiche ; Jean garde la sienne sans compte.
      const paul = await tokenFor('ENSEIGNANT', 'paul@test.local');
      await prisma.teacher.update({
        where: { id: t1.id },
        data: { userId: paul.user.id },
      });
      return { entryA, entryB, sA, sB, t1, t2, paul, classA, classB };
    }

    it('ne voit et ne remplit que ses séances (D60)', async () => {
      const { entryA, entryB, sA, paul } = await setup();

      const day = await get(`/attendance/day?date=${today}`, paul.token).expect(
        200,
      );
      expect(
        day.body.seances.map((s: { entryId: string }) => s.entryId),
      ).toEqual([entryA.id]);

      await get(
        `/attendance/sheet?entryId=${entryA.id}&date=${today}`,
        paul.token,
      ).expect(200);
      await get(
        `/attendance/sheet?entryId=${entryB.id}&date=${today}`,
        paul.token,
      ).expect(403);

      // Il fait l'appel de sa séance, et pas celui de la séance de son collègue.
      await post('/attendance/calls', paul.token, {
        entryId: entryA.id,
        date: today,
        absences: [{ studentId: sA.id, absent: true }],
      }).expect(201);
      const other = await post('/attendance/calls', paul.token, {
        entryId: entryB.id,
        date: today,
        absences: [],
      });
      expect(other.status).toBe(403);
      expect(await prisma.attendanceCall.count()).toBe(1);
    });

    it('ne peut pas lire les absences, l’historique ni les justificatifs de l’école (ATTENDANCE_READ)', async () => {
      const { sA, paul } = await setup();
      await get(
        `/attendance/absences?from=${today}&to=${today}`,
        paul.token,
      ).expect(403);
      await get(`/attendance/students/${sA.id}/history`, paul.token).expect(
        403,
      );
    });

    it('voit le statut d’un justificatif, jamais son motif ni son commentaire (RV12)', async () => {
      const { entryA, sA, paul } = await setup();
      const saved = await post('/attendance/calls', adminToken, {
        entryId: entryA.id,
        date: today,
        absences: [{ studentId: sA.id, absent: true }],
      }).expect(201);
      const recordId = saved.body.eleves.find(
        (e: { studentId: string }) => e.studentId === sA.id,
      ).recordId;
      await post(`/attendance/records/${recordId}/justification`, adminToken, {
        commentaire: 'Rendez-vous médical',
      }).expect(201);

      const asAdmin = await get(
        `/attendance/sheet?entryId=${entryA.id}&date=${today}`,
        adminToken,
      ).expect(200);
      const adminRow = asAdmin.body.eleves.find(
        (e: { studentId: string }) => e.studentId === sA.id,
      );
      expect(adminRow.justification.commentaire).toBe('Rendez-vous médical');

      const asTeacher = await get(
        `/attendance/sheet?entryId=${entryA.id}&date=${today}`,
        paul.token,
      ).expect(200);
      const row = asTeacher.body.eleves.find(
        (e: { studentId: string }) => e.studentId === sA.id,
      );
      expect(row.justification).not.toBeNull();
      expect(row.justification.commentaire).toBeNull();
      expect(row.justification.motif).toBeNull();
    });

    it('un compte enseignant sans fiche enseignant reliée n’a aucun accès à l’appel', async () => {
      await setup();
      const orphan = await tokenFor('ENSEIGNANT', 'sans-fiche@test.local');
      await get(`/attendance/day?date=${today}`, orphan.token).expect(403);
    });

    it('la vie scolaire et la Direction gardent toute l’école', async () => {
      const { entryA, entryB } = await setup();
      const surveillant = await tokenFor('SURVEILLANT', 'surv@test.local');
      const day = await get(
        `/attendance/day?date=${today}`,
        surveillant.token,
      ).expect(200);
      expect(
        day.body.seances.map((s: { entryId: string }) => s.entryId).sort(),
      ).toEqual([entryA.id, entryB.id].sort());
      await get(
        `/attendance/sheet?entryId=${entryB.id}&date=${today}`,
        surveillant.token,
      ).expect(200);
    });

    it('un remplaçant fait l’appel de la séance qu’il remplace, l’enseignant remplacé n’y a plus accès', async () => {
      const { entryB, t1, t2, paul } = await setup();
      const jean = await tokenFor('ENSEIGNANT', 'jean@test.local');
      await prisma.teacher.update({
        where: { id: t2.id },
        data: { userId: jean.user.id },
      });
      // Avant : la séance B est celle de Jean, pas celle de Paul.
      await get(
        `/attendance/sheet?entryId=${entryB.id}&date=${today}`,
        jean.token,
      ).expect(200);
      await get(
        `/attendance/sheet?entryId=${entryB.id}&date=${today}`,
        paul.token,
      ).expect(403);

      // Paul remplace Jean sur la séance B d'aujourd'hui.
      await post(`/timetable-entries/${entryB.id}/exceptions`, adminToken, {
        date: today,
        type: 'REMPLACEE',
        motif: 'Absence de Jean',
        replacementTeacherId: t1.id,
      }).expect(201);
      const day = await get(`/attendance/day?date=${today}`, paul.token).expect(
        200,
      );
      expect(
        day.body.seances.map((s: { entryId: string }) => s.entryId),
      ).toContain(entryB.id);
      await get(
        `/attendance/sheet?entryId=${entryB.id}&date=${today}`,
        paul.token,
      ).expect(200);
      await get(
        `/attendance/sheet?entryId=${entryB.id}&date=${today}`,
        jean.token,
      ).expect(403);
    });

    it('le rôle ENSEIGNANT porte ATTENDANCE_TAKE mais ni ATTENDANCE_READ ni ATTENDANCE_CORRECT', async () => {
      await setup();
      const perms = await permissionsOf('ENSEIGNANT');
      expect(perms).toContain('ATTENDANCE_TAKE');
      expect(perms).not.toContain('ATTENDANCE_READ');
      expect(perms).not.toContain('ATTENDANCE_CORRECT');
    });
  });

  // ------------------------------------------------------------------ 3. Finances séparées des dossiers d'élèves

  describe('lecture des finances (FINANCE_READ)', () => {
    const FINANCE_ROUTES = [
      '/reports/dashboard',
      '/reports/insolvent-students',
      '/reports/export/insolvent-students',
    ];

    it('le surveillant lit les dossiers d’élèves mais pas les finances', async () => {
      const surveillant = await tokenFor('SURVEILLANT', 'surv@test.local');
      await get('/students', surveillant.token).expect(200);
      await get('/reports/students-by-class', surveillant.token).expect(200);
      for (const route of FINANCE_ROUTES) {
        const res = await get(route, surveillant.token);
        expect({ route, status: res.status }).toEqual({ route, status: 403 });
      }
      await get('/students/inconnu/financial-status', surveillant.token).expect(
        403,
      );
      await get('/payments?studentId=inconnu', surveillant.token).expect(403);
      await get('/invoices/by-enrollment/inconnu', surveillant.token).expect(
        403,
      );
      await get('/discounts', surveillant.token).expect(403);
    });

    it('l’enseignant n’a ni dossiers d’élèves ni finances', async () => {
      const prof = await tokenFor('ENSEIGNANT', 'prof@test.local');
      await get('/students', prof.token).expect(403);
      for (const route of FINANCE_ROUTES) {
        await get(route, prof.token).expect(403);
      }
    });

    it.each([
      'ADMINISTRATEUR',
      'DIRECTION',
      'SECRETAIRE_CAISSIER',
      'COMPTABLE',
      'AUDITEUR',
    ])('le rôle %s garde la lecture des finances', async (roleCode) => {
      const acc = await tokenFor(
        roleCode,
        `${roleCode.toLowerCase()}@test.local`,
      );
      for (const route of FINANCE_ROUTES) {
        const res = await get(route, acc.token);
        expect({ route, status: res.status }).toEqual({ route, status: 200 });
      }
      await get('/payments?studentId=inconnu', acc.token).expect(200);
    });

    it('le parcours de la migration : tout rôle qui lisait les dossiers lit encore les finances, sauf le surveillant', async () => {
      const readers: string[] = [];
      for (const code of [
        'ADMINISTRATEUR',
        'DIRECTION',
        'SECRETAIRE_CAISSIER',
        'COMPTABLE',
        'AUDITEUR',
        'SURVEILLANT',
      ]) {
        const perms = await permissionsOf(code);
        if (perms.includes('STUDENT_READ') && perms.includes('FINANCE_READ'))
          readers.push(code);
      }
      expect(readers.sort()).toEqual([
        'ADMINISTRATEUR',
        'AUDITEUR',
        'COMPTABLE',
        'DIRECTION',
        'SECRETAIRE_CAISSIER',
      ]);
    });
  });

  // ------------------------------------------------------------------ 2. Pas d'élévation de droits

  describe('droits réservés à la Direction', () => {
    it('l’Administrateur ne peut pas s’accorder l’approbation des remises, des sorties ni des annulations', async () => {
      const roles = (await get('/roles', adminToken)).body as Array<{
        id: string;
        code: string;
        permissions: string[];
      }>;
      const admin = roles.find((r) => r.code === 'ADMINISTRATEUR')!;
      const before = await permissionsOf('ADMINISTRATEUR');

      for (const reserved of [
        'DISCOUNT_APPROVE',
        'EXPENSE_APPROVE',
        'PAYMENT_CANCEL_APPROVE',
        'PILOTAGE_READ',
      ]) {
        const res = await put(`/roles/${admin.id}/permissions`, adminToken, {
          permissionCodes: [...admin.permissions, reserved],
        });
        expect({ reserved, status: res.status }).toEqual({
          reserved,
          status: 403,
        });
      }
      expect(await permissionsOf('ADMINISTRATEUR')).toEqual(before);
    });

    it('l’Administrateur ne peut pas retirer un droit réservé à la Direction', async () => {
      const roles = (await get('/roles', adminToken)).body as Array<{
        id: string;
        code: string;
        permissions: string[];
      }>;
      const direction = roles.find((r) => r.code === 'DIRECTION')!;
      const before = await permissionsOf('DIRECTION');
      const res = await put(`/roles/${direction.id}/permissions`, adminToken, {
        permissionCodes: direction.permissions.filter(
          (p) => p !== 'DISCOUNT_APPROVE',
        ),
      });
      expect(res.status).toBe(403);
      expect(await permissionsOf('DIRECTION')).toEqual(before);
    });

    it('l’Administrateur reste libre de gérer les autres permissions', async () => {
      const roles = (await get('/roles', adminToken)).body as Array<{
        id: string;
        code: string;
        permissions: string[];
      }>;
      const secretaire = roles.find((r) => r.code === 'SECRETAIRE_CAISSIER')!;
      await put(`/roles/${secretaire.id}/permissions`, adminToken, {
        permissionCodes: [...secretaire.permissions, 'TIMETABLE_READ'].filter(
          (v, i, a) => a.indexOf(v) === i,
        ),
      }).expect(200);
      expect(await permissionsOf('SECRETAIRE_CAISSIER')).toContain(
        'TIMETABLE_READ',
      );
    });

    it('un compte qui détient lui-même le droit réservé peut l’accorder', async () => {
      const boss = await customToken(
        'GESTION_TOTALE',
        ['ROLE_MANAGE', 'DISCOUNT_APPROVE'],
        'boss@test.local',
      );
      const role = await prisma.role.create({
        data: { code: 'CUSTOM', nom: 'Custom', description: 'test' },
      });
      await put(`/roles/${role.id}/permissions`, boss.token, {
        permissionCodes: ['DISCOUNT_APPROVE'],
      }).expect(200);
      expect(await permissionsOf('CUSTOM')).toEqual(['DISCOUNT_APPROVE']);
      // Mais pas EXPENSE_APPROVE qu'il ne détient pas.
      await put(`/roles/${role.id}/permissions`, boss.token, {
        permissionCodes: ['DISCOUNT_APPROVE', 'EXPENSE_APPROVE'],
      }).expect(403);
    });

    it('l’Administrateur ne crée pas de compte Direction, mais crée un enseignant', async () => {
      const roles = (await get('/roles', adminToken)).body as Array<{
        id: string;
        code: string;
      }>;
      const idOf = (code: string) => roles.find((r) => r.code === code)!.id;

      await post('/users', adminToken, {
        nom: 'X',
        prenom: 'Y',
        email: 'faux-directeur@test.local',
        motDePasse: 'MotDePasse123!',
        roleId: idOf('DIRECTION'),
      }).expect(403);
      expect(
        await prisma.user.count({
          where: { email: 'faux-directeur@test.local' },
        }),
      ).toBe(0);

      await post('/users', adminToken, {
        nom: 'Prof',
        prenom: 'Nouveau',
        email: 'nouveau-prof@test.local',
        motDePasse: 'MotDePasse123!',
        roleId: idOf('ENSEIGNANT'),
      }).expect(201);
    });

    it('l’Administrateur ne change pas un rôle vers Direction, ni ne réinitialise le mot de passe d’un directeur', async () => {
      const directeur = await tokenFor('DIRECTION', 'directeur@test.local');
      const roles = (await get('/roles', adminToken)).body as Array<{
        id: string;
        code: string;
      }>;
      const idOf = (code: string) => roles.find((r) => r.code === code)!.id;
      const surv = await tokenFor('SURVEILLANT', 'surv@test.local');

      // Élévation : promouvoir un surveillant en Direction.
      await patch(`/users/${surv.user.id}`, adminToken, {
        roleId: idOf('DIRECTION'),
      }).expect(403);
      // Prise de contrôle : réinitialiser le mot de passe du directeur.
      await patch(`/users/${directeur.user.id}/reset-password`, adminToken, {
        nouveauMotDePasse: 'PriseDeControle123!',
      }).expect(403);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'directeur@test.local',
          motDePasse: 'PriseDeControle123!',
        })
        .expect(401);
      // Rétrograder un directeur reste une modification d'un compte à droits réservés : refusée aussi.
      await patch(`/users/${directeur.user.id}`, adminToken, {
        roleId: idOf('SURVEILLANT'),
      }).expect(403);
      // Désactiver ou renommer ne donne aucun droit : permis (départ d'un directeur).
      await patch(`/users/${directeur.user.id}`, adminToken, {
        statut: 'INACTIF',
      }).expect(200);
    });

    it('la Direction nomme un directeur et réinitialise son mot de passe', async () => {
      const directeur = await tokenFor('DIRECTION', 'directeur@test.local');
      const roles = (await get('/roles', directeur.token)).body as Array<{
        id: string;
        code: string;
      }>;
      const direction = roles.find((r) => r.code === 'DIRECTION')!;

      const created = await post('/users', directeur.token, {
        nom: 'Nouveau',
        prenom: 'Directeur',
        email: 'directeur2@test.local',
        motDePasse: 'MotDePasse123!',
        roleId: direction.id,
      }).expect(201);
      await patch(`/users/${created.body.id}/reset-password`, directeur.token, {
        nouveauMotDePasse: 'NouveauSecret123!',
      }).expect(200);
    });
  });

  // ------------------------------------------------------------------ 4. On n'approuve pas sa propre demande

  describe('auto-approbation refusée', () => {
    it('une sortie financière : l’auteur ne l’approuve pas, un autre responsable oui (D25)', async () => {
      const both = await customToken(
        'COMPTABLE_DIRECTEUR',
        ['EXPENSE_CREATE', 'EXPENSE_APPROVE', 'CASH_CLOSE'],
        'cumul@test.local',
      );
      const created = await post('/expenses', both.token, {
        categorie: 'ACHAT_MATERIEL',
        montant: 50000,
        description: 'Achat de craie',
      }).expect(201);

      const self = await post(
        `/expenses/${created.body.id}/approve`,
        both.token,
      );
      expect(self.status).toBe(403);
      expect(self.body.message).toMatch(/propre sortie/);
      expect(
        (
          await prisma.expense.findUniqueOrThrow({
            where: { id: created.body.id },
          })
        ).statut,
      ).toBe('EN_ATTENTE');

      const directeur = await tokenFor('DIRECTION', 'directeur@test.local');
      await post(
        `/expenses/${created.body.id}/approve`,
        directeur.token,
      ).expect(201);
    });
  });
});

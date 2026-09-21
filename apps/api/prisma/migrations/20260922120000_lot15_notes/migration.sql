-- Lot 15 : notes, évaluations et bulletins (vague 2, D51). Généré par prisma migrate diff, puis complété par les
-- permissions ci-dessous (le seed n'est pas rejoué à chaque déploiement, voir 20260922090000_hardening_roles).

-- CreateEnum
CREATE TYPE "GradeStatus" AS ENUM ('NOTE', 'ABSENT', 'DISPENSE');

-- CreateEnum
CREATE TYPE "BulletinPeriodStatus" AS ENUM ('OUVERT', 'VALIDE', 'PUBLIE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BULLETIN_DISPONIBLE';

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "baremeDefaut" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "moyennePassage" DECIMAL(4,2);

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "affichageLettres" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "subject_levels" ADD COLUMN     "coefficient" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "bareme" INTEGER NOT NULL,
    "coefficient" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "statut" "GradeStatus" NOT NULL DEFAULT 'NOTE',
    "valeur" DECIMAL(6,2),
    "saisiParId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_corrections" (
    "id" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "ancienStatut" "GradeStatus" NOT NULL,
    "ancienneValeur" DECIMAL(6,2),
    "nouveauStatut" "GradeStatus" NOT NULL,
    "nouvelleValeur" DECIMAL(6,2),
    "motif" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_appreciations" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "texte" TEXT NOT NULL,
    "saisiParId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_appreciations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletin_periods" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "statut" "BulletinPeriodStatus" NOT NULL DEFAULT 'OUVERT',
    "valideAt" TIMESTAMP(3),
    "valideParId" TEXT,
    "publieAt" TIMESTAMP(3),
    "publieParId" TEXT,
    "rouvertAt" TIMESTAMP(3),
    "rouvertParId" TEXT,
    "rouvertMotif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulletin_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletins" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "moyenneGenerale" DECIMAL(5,2),
    "rang" INTEGER,
    "effectif" INTEGER NOT NULL,
    "moyenneClasse" DECIMAL(5,2),
    "appreciationGenerale" TEXT,
    "lignes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulletins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" TEXT NOT NULL,
    "lettre" TEXT NOT NULL,
    "minimum" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "grade_bands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluations_classId_subjectId_termId_idx" ON "evaluations"("classId", "subjectId", "termId");

-- CreateIndex
CREATE INDEX "grades_studentId_idx" ON "grades"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "grades_evaluationId_studentId_key" ON "grades"("evaluationId", "studentId");

-- CreateIndex
CREATE INDEX "grade_corrections_gradeId_idx" ON "grade_corrections"("gradeId");

-- CreateIndex
CREATE UNIQUE INDEX "subject_appreciations_termId_classId_subjectId_studentId_key" ON "subject_appreciations"("termId", "classId", "subjectId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "bulletin_periods_termId_classId_key" ON "bulletin_periods"("termId", "classId");

-- CreateIndex
CREATE INDEX "bulletins_studentId_idx" ON "bulletins"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "bulletins_periodId_studentId_key" ON "bulletins"("periodId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "grade_bands_lettre_key" ON "grade_bands"("lettre");

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_saisiParId_fkey" FOREIGN KEY ("saisiParId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_corrections" ADD CONSTRAINT "grade_corrections_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_corrections" ADD CONSTRAINT "grade_corrections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_periods" ADD CONSTRAINT "bulletin_periods_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_periods" ADD CONSTRAINT "bulletin_periods_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "bulletin_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permissions du lot (idempotent : rejouable, ne retire rien).
INSERT INTO "permissions" ("id", "code", "description") VALUES
  ('perm_grade_enter', 'GRADE_ENTER', 'Créer des évaluations et saisir les notes de ses classes et matières (un enseignant : uniquement ses affectations).'),
  ('perm_grade_read', 'GRADE_READ', 'Consulter les évaluations, notes, résultats et bulletins de toute l''école.'),
  ('perm_grade_correct', 'GRADE_CORRECT', 'Corriger une note après le verrouillage du trimestre, avec un motif.'),
  ('perm_bulletin_validate', 'BULLETIN_VALIDATE', 'Valider, rouvrir et publier les bulletins d''un trimestre pour une classe.')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_l15_' || r."id" || '_' || p."id", r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON
     (r."code" = 'ENSEIGNANT'     AND p."code" IN ('GRADE_ENTER'))
  OR (r."code" = 'ADMINISTRATEUR' AND p."code" IN ('GRADE_READ'))
  OR (r."code" = 'DIRECTION'      AND p."code" IN ('GRADE_READ', 'GRADE_CORRECT', 'BULLETIN_VALIDATE'))
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- La colonne de l'ancien statut est facultative : une correction peut porter sur une note qui n'existait pas encore.
-- AlterTable
ALTER TABLE "grade_corrections" ALTER COLUMN "ancienStatut" DROP NOT NULL;


-- Le parent voit-il le rang de son enfant sur le bulletin ? Non par défaut (à décider par la Direction).
ALTER TABLE "schools" ADD COLUMN     "bulletinAfficheRang" BOOLEAN NOT NULL DEFAULT false;

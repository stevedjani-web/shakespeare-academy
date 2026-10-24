-- CreateEnum
CREATE TYPE "TeacherSubmissionStatus" AS ENUM ('EN_ATTENTE', 'VALIDEE', 'REFUSEE');

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "photoFichier" TEXT,
ADD COLUMN     "urgenceNom" TEXT,
ADD COLUMN     "urgenceTelephone" TEXT;

-- CreateTable
CREATE TABLE "teacher_collect_links" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_collect_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_submissions" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "telephoneCle" TEXT NOT NULL,
    "email" TEXT,
    "urgenceNom" TEXT,
    "urgenceTelephone" TEXT,
    "photoFichier" TEXT,
    "matieres" TEXT[],
    "motDePasseHash" TEXT,
    "consentementVersion" TEXT NOT NULL,
    "statut" "TeacherSubmissionStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "motifRefus" TEXT,
    "teacherId" TEXT,
    "userId" TEXT,
    "traiteParId" TEXT,
    "traiteLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_collect_links_schoolId_key" ON "teacher_collect_links"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_collect_links_token_key" ON "teacher_collect_links"("token");

-- CreateIndex
CREATE INDEX "teacher_submissions_schoolId_statut_createdAt_idx" ON "teacher_submissions"("schoolId", "statut", "createdAt");

-- CreateIndex
CREATE INDEX "teacher_submissions_telephoneCle_idx" ON "teacher_submissions"("telephoneCle");

-- AddForeignKey
ALTER TABLE "teacher_collect_links" ADD CONSTRAINT "teacher_collect_links_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_submissions" ADD CONSTRAINT "teacher_submissions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_submissions" ADD CONSTRAINT "teacher_submissions_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "teacher_collect_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Droit de la collecte des enseignants. Idempotent, ne retire rien.
--   TEACHER_ONBOARDING_MANAGE : gérer le lien partagé, valider ou refuser les demandes des enseignants. Tout rôle qui
--   gère les inscriptions (ENROLLMENT_MANAGE : Administrateur, Secrétaire-caissier) ou le référentiel pédagogique
--   (PEDAGOGY_MANAGE : Administrateur, Direction, Promoteur) le reçoit, rôle sur mesure compris.
INSERT INTO "permissions" ("id", "code", "description")
VALUES
  ('perm_teacher_onboarding_manage', 'TEACHER_ONBOARDING_MANAGE', 'Gérer le lien de collecte des enseignants, valider ou refuser leurs demandes.')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT DISTINCT 'rp_tob_manage_' || r."id", r."id", p_new."id"
FROM "roles" r
JOIN "role_permissions" rp ON rp."roleId" = r."id"
JOIN "permissions" p_old ON p_old."id" = rp."permissionId" AND p_old."code" IN ('ENROLLMENT_MANAGE', 'PEDAGOGY_MANAGE')
CROSS JOIN "permissions" p_new
WHERE p_new."code" = 'TEACHER_ONBOARDING_MANAGE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

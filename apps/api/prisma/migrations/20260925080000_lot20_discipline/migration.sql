-- CreateEnum
CREATE TYPE "DisciplineNature" AS ENUM ('INCIDENT', 'VALORISATION');

-- CreateEnum
CREATE TYPE "DisciplineGravite" AS ENUM ('LEGER', 'MOYEN', 'GRAVE');

-- CreateEnum
CREATE TYPE "DisciplineRecordStatus" AS ENUM ('OUVERT', 'TRAITE', 'ANNULE');

-- CreateEnum
CREATE TYPE "SanctionStatus" AS ENUM ('DECIDEE', 'PUBLIEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "ConvocationStatus" AS ENUM ('ENVOYEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "ConvocationIssue" AS ENUM ('PRESENT', 'ABSENT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DISCIPLINE';

-- CreateTable
CREATE TABLE "discipline_types" (
    "id" TEXT NOT NULL,
    "nature" "DisciplineNature" NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discipline_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanction_types" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sanction_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discipline_records" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "nature" "DisciplineNature" NOT NULL,
    "typeId" TEXT NOT NULL,
    "dateFaits" DATE NOT NULL,
    "gravite" "DisciplineGravite",
    "description" TEXT NOT NULL,
    "auteurUserId" TEXT NOT NULL,
    "statut" "DisciplineRecordStatus" NOT NULL DEFAULT 'OUVERT',
    "motifClassement" TEXT,
    "motifAnnulation" TEXT,
    "annuleParUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT,

    CONSTRAINT "discipline_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discipline_record_revisions" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "avant" JSONB NOT NULL,
    "motif" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discipline_record_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanctions" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE,
    "messageFamille" TEXT,
    "statut" "SanctionStatus" NOT NULL DEFAULT 'DECIDEE',
    "decideParUserId" TEXT NOT NULL,
    "publieLe" TIMESTAMP(3),
    "publieParUserId" TEXT,
    "annuleLe" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "annuleParUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sanctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discipline_convocations" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "recordId" TEXT,
    "dateRdv" TIMESTAMP(3) NOT NULL,
    "lieu" TEXT NOT NULL,
    "objet" TEXT NOT NULL,
    "statut" "ConvocationStatus" NOT NULL DEFAULT 'ENVOYEE',
    "creeParUserId" TEXT NOT NULL,
    "accuseLe" TIMESTAMP(3),
    "accuseParGuardianId" TEXT,
    "issue" "ConvocationIssue",
    "issueLe" TIMESTAMP(3),
    "annuleLe" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discipline_convocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discipline_types_nature_nom_key" ON "discipline_types"("nature", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "sanction_types_nom_key" ON "sanction_types"("nom");

-- CreateIndex
CREATE INDEX "discipline_records_studentId_dateFaits_idx" ON "discipline_records"("studentId", "dateFaits");

-- CreateIndex
CREATE INDEX "discipline_records_auteurUserId_idx" ON "discipline_records"("auteurUserId");

-- CreateIndex
CREATE INDEX "discipline_records_academicYearId_statut_idx" ON "discipline_records"("academicYearId", "statut");

-- CreateIndex
CREATE INDEX "discipline_record_revisions_recordId_idx" ON "discipline_record_revisions"("recordId");

-- CreateIndex
CREATE INDEX "sanctions_studentId_statut_idx" ON "sanctions"("studentId", "statut");

-- CreateIndex
CREATE INDEX "sanctions_recordId_idx" ON "sanctions"("recordId");

-- CreateIndex
CREATE INDEX "discipline_convocations_studentId_dateRdv_idx" ON "discipline_convocations"("studentId", "dateRdv");

-- AddForeignKey
ALTER TABLE "discipline_records" ADD CONSTRAINT "discipline_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_records" ADD CONSTRAINT "discipline_records_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_records" ADD CONSTRAINT "discipline_records_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_records" ADD CONSTRAINT "discipline_records_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "discipline_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_records" ADD CONSTRAINT "discipline_records_auteurUserId_fkey" FOREIGN KEY ("auteurUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_records" ADD CONSTRAINT "discipline_records_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_record_revisions" ADD CONSTRAINT "discipline_record_revisions_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "discipline_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_record_revisions" ADD CONSTRAINT "discipline_record_revisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "discipline_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "sanction_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_decideParUserId_fkey" FOREIGN KEY ("decideParUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_convocations" ADD CONSTRAINT "discipline_convocations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_convocations" ADD CONSTRAINT "discipline_convocations_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "discipline_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_convocations" ADD CONSTRAINT "discipline_convocations_creeParUserId_fkey" FOREIGN KEY ("creeParUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Droits du Lot 20 (le seed n'est pas rejoue en production : sans ces lignes elles ne seraient pas connues).
-- DISCIPLINE_REPORT : signaler un incident ou une valorisation ; DISCIPLINE_READ : lire tout le dossier de l'ecole ;
-- DISCIPLINE_CONVOKE : convoquer une famille ; DISCIPLINE_DECIDE : decider, publier et annuler une sanction (Direction).
INSERT INTO "permissions" ("id", "code", "description")
VALUES
  ('perm_discipline_report', 'DISCIPLINE_REPORT', 'Signaler un incident ou une valorisation (un enseignant : uniquement les eleves de ses classes).'),
  ('perm_discipline_read', 'DISCIPLINE_READ', 'Lire les signalements, sanctions et convocations de toute l''ecole.'),
  ('perm_discipline_convoke', 'DISCIPLINE_CONVOKE', 'Convoquer une famille et cloturer la convocation.'),
  ('perm_discipline_decide', 'DISCIPLINE_DECIDE', 'Decider, publier et annuler une sanction, corriger ou annuler un signalement.')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_disc_' || p."code" || '_' || r."id", r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" LIKE 'DISCIPLINE_%'
WHERE (r."code" = 'DIRECTION')
   OR (r."code" = 'SURVEILLANT' AND p."code" IN ('DISCIPLINE_REPORT', 'DISCIPLINE_READ', 'DISCIPLINE_CONVOKE'))
   OR (r."code" = 'ENSEIGNANT' AND p."code" = 'DISCIPLINE_REPORT')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

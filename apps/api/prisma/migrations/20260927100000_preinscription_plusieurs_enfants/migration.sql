-- Préinscription : une demande porte un parent et plusieurs enfants, chacun avec sa classe demandée, son statut
-- (nouvel élève ou ancien élève), ses documents et son propre traitement par le secrétariat.
-- Les demandes déjà déposées (un enfant chacune) sont conservées : chacune devient une demande à un enfant.

-- CreateEnum
CREATE TYPE "PreRegistrationStudentKind" AS ENUM ('NOUVEAU', 'ANCIEN');

-- CreateTable
CREATE TABLE "pre_registration_children" (
    "id" TEXT NOT NULL,
    "preRegistrationId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "sexe" "Sexe" NOT NULL,
    "dateNaissance" TIMESTAMP(3) NOT NULL,
    "lieuNaissance" TEXT,
    "nationalite" TEXT,
    "levelId" TEXT NOT NULL,
    "typeEleve" "PreRegistrationStudentKind" NOT NULL,
    "ancienEtablissement" TEXT,
    "classePrecedenteLevelId" TEXT,
    "bulletinFichier" TEXT,
    "bulletinNom" TEXT,
    "bulletinType" TEXT,
    "bulletinTaille" INTEGER,
    "statut" "PreRegistrationStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "motifRejet" TEXT,
    "studentId" TEXT,
    "enrollmentId" TEXT,
    "traiteParUserId" TEXT,
    "traiteLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_registration_children_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pre_registration_children_statut_createdAt_idx" ON "pre_registration_children"("statut", "createdAt");

-- CreateIndex
CREATE INDEX "pre_registration_children_preRegistrationId_idx" ON "pre_registration_children"("preRegistrationId");

-- AddForeignKey
ALTER TABLE "pre_registration_children" ADD CONSTRAINT "pre_registration_children_preRegistrationId_fkey" FOREIGN KEY ("preRegistrationId") REFERENCES "pre_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_registration_children" ADD CONSTRAINT "pre_registration_children_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_registration_children" ADD CONSTRAINT "pre_registration_children_classePrecedenteLevelId_fkey" FOREIGN KEY ("classePrecedenteLevelId") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reprise des demandes existantes : l'enfant d'une demande devient sa première (et seule) fiche enfant, avec le même
-- identifiant, le même statut et les mêmes dates de traitement. Une demande ancienne n'avait pas de choix
-- « nouvel élève / ancien élève » : elle est rangée en « nouvel élève ».
INSERT INTO "pre_registration_children" (
    "id", "preRegistrationId", "ordre", "nom", "prenom", "sexe", "dateNaissance", "lieuNaissance", "nationalite",
    "levelId", "typeEleve", "statut", "motifRejet", "studentId", "enrollmentId", "traiteParUserId", "traiteLe",
    "createdAt", "updatedAt"
)
SELECT
    "id", "id", 0, "nom", "prenom", "sexe", "dateNaissance", "lieuNaissance", "nationalite",
    "levelId", 'NOUVEAU', "statut", "motifRejet", "studentId", "enrollmentId", "traiteParUserId", "traiteLe",
    "createdAt", "updatedAt"
FROM "pre_registrations";

-- La demande ne garde que le parent ou tuteur et le message.
DROP INDEX "pre_registrations_statut_createdAt_idx";
ALTER TABLE "pre_registrations"
    DROP COLUMN "nom",
    DROP COLUMN "prenom",
    DROP COLUMN "sexe",
    DROP COLUMN "dateNaissance",
    DROP COLUMN "lieuNaissance",
    DROP COLUMN "nationalite",
    DROP COLUMN "levelId",
    DROP COLUMN "statut",
    DROP COLUMN "motifRejet",
    DROP COLUMN "studentId",
    DROP COLUMN "enrollmentId",
    DROP COLUMN "traiteParUserId",
    DROP COLUMN "traiteLe";

-- CreateIndex
CREATE INDEX "pre_registrations_createdAt_idx" ON "pre_registrations"("createdAt");

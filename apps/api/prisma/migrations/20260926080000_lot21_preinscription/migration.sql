-- CreateEnum
CREATE TYPE "PreRegistrationStatus" AS ENUM ('EN_ATTENTE', 'ACCEPTEE', 'REJETEE');

-- CreateTable
CREATE TABLE "pre_registrations" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "sexe" "Sexe" NOT NULL,
    "dateNaissance" TIMESTAMP(3) NOT NULL,
    "lieuNaissance" TEXT,
    "nationalite" TEXT,
    "levelId" TEXT NOT NULL,
    "responsableNom" TEXT NOT NULL,
    "responsablePrenom" TEXT NOT NULL,
    "responsableTelephone" TEXT NOT NULL,
    "responsableEmail" TEXT,
    "message" TEXT,
    "statut" "PreRegistrationStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "motifRejet" TEXT,
    "studentId" TEXT,
    "enrollmentId" TEXT,
    "traiteParUserId" TEXT,
    "traiteLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pre_registrations_reference_key" ON "pre_registrations"("reference");

-- CreateIndex
CREATE INDEX "pre_registrations_statut_createdAt_idx" ON "pre_registrations"("statut", "createdAt");

-- CreateIndex
CREATE INDEX "pre_registrations_responsableTelephone_idx" ON "pre_registrations"("responsableTelephone");

-- AddForeignKey
ALTER TABLE "pre_registrations" ADD CONSTRAINT "pre_registrations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_registrations" ADD CONSTRAINT "pre_registrations_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


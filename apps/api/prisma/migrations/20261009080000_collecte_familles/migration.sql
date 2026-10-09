-- CreateEnum
CREATE TYPE "FamilyChildStatus" AS ENUM ('EN_ATTENTE', 'VALIDE', 'REFUSE');

-- CreateTable
CREATE TABLE "class_collect_links" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_collect_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_submissions" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "email" TEXT,
    "profession" TEXT,
    "adresse" TEXT,
    "lien" TEXT,
    "motDePasseHash" TEXT,
    "consentementVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_submission_children" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "classId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3) NOT NULL,
    "lieuNaissance" TEXT,
    "statut" "FamilyChildStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "motifRefus" TEXT,
    "studentId" TEXT,
    "traiteParUserId" TEXT,
    "traiteLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_submission_children_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_collect_links_classId_key" ON "class_collect_links"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "class_collect_links_token_key" ON "class_collect_links"("token");

-- CreateIndex
CREATE INDEX "family_submissions_createdAt_idx" ON "family_submissions"("createdAt");

-- CreateIndex
CREATE INDEX "family_submissions_telephone_idx" ON "family_submissions"("telephone");

-- CreateIndex
CREATE INDEX "family_submission_children_statut_classId_idx" ON "family_submission_children"("statut", "classId");

-- CreateIndex
CREATE INDEX "family_submission_children_submissionId_idx" ON "family_submission_children"("submissionId");

-- AddForeignKey
ALTER TABLE "class_collect_links" ADD CONSTRAINT "class_collect_links_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_submissions" ADD CONSTRAINT "family_submissions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_submissions" ADD CONSTRAINT "family_submissions_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "class_collect_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_submission_children" ADD CONSTRAINT "family_submission_children_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "family_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_submission_children" ADD CONSTRAINT "family_submission_children_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


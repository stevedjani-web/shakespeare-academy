-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ATTESTATION_SCOLARITE', 'CARTE_ELEVE');

-- CreateEnum
CREATE TYPE "DocumentIssuer" AS ENUM ('STAFF', 'PARENT');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "directeurNom" TEXT,
ADD COLUMN     "directeurTitre" TEXT NOT NULL DEFAULT 'Le Directeur',
ADD COLUMN     "signatureUrl" TEXT,
ADD COLUMN     "ville" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "lieuNaissance" TEXT;

-- CreateTable
CREATE TABLE "issued_documents" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "numero" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "emisParType" "DocumentIssuer" NOT NULL,
    "emisParId" TEXT,
    "dateEmission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annuleLe" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "annuleParUserId" TEXT,

    CONSTRAINT "issued_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "issued_documents_verificationToken_key" ON "issued_documents"("verificationToken");

-- CreateIndex
CREATE INDEX "issued_documents_studentId_type_idx" ON "issued_documents"("studentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "issued_documents_schoolId_numero_key" ON "issued_documents"("schoolId", "numero");

-- AddForeignKey
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_annuleParUserId_fkey" FOREIGN KEY ("annuleParUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Droits du Lot 19 (le seed n'est pas rejoué en production : sans ces lignes elles ne seraient pas connues).
-- DOCUMENT_ISSUE : émettre attestations et cartes ; DOCUMENT_CANCEL : annuler un document (réservé à la Direction).
INSERT INTO "permissions" ("id", "code", "description")
VALUES
  ('perm_document_issue', 'DOCUMENT_ISSUE', 'Émettre et réimprimer les attestations de scolarité et les cartes d''élève.'),
  ('perm_document_cancel', 'DOCUMENT_CANCEL', 'Annuler un document officiel émis (attestation, carte), avec un motif.')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_docissue_' || r."id", r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."code" = 'DOCUMENT_ISSUE'
  AND r."code" IN ('ADMINISTRATEUR', 'DIRECTION', 'SECRETAIRE_CAISSIER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_doccancel_' || r."id", r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."code" = 'DOCUMENT_CANCEL'
  AND r."code" = 'DIRECTION'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

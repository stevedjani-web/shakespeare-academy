-- CreateEnum
CREATE TYPE "BankPaymentMethod" AS ENUM ('VIREMENT', 'DEPOT_BANCAIRE', 'CHEQUE');

-- CreateEnum
CREATE TYPE "BankPaymentStatus" AS ENUM ('EN_ATTENTE', 'CREDIT_CONFIRME', 'VALIDE', 'REJETE', 'RETIRE');


-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "dateOperation" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "school_bank_accounts" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "banque" TEXT NOT NULL,
    "titulaire" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "instructions" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_payment_claims" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "guardianId" TEXT,
    "declaredByUserId" TEXT,
    "methode" "BankPaymentMethod" NOT NULL,
    "montant" INTEGER NOT NULL,
    "banque" TEXT NOT NULL,
    "compteId" TEXT,
    "referenceOperation" TEXT NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "dateOperation" TIMESTAMP(3) NOT NULL,
    "payeur" TEXT,
    "note" TEXT,
    "statut" "BankPaymentStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "montantCredite" INTEGER,
    "dateCredit" TIMESTAMP(3),
    "referenceReleve" TEXT,
    "confirmeParId" TEXT,
    "confirmeLe" TIMESTAMP(3),
    "valideParId" TEXT,
    "valideLe" TIMESTAMP(3),
    "excedent" INTEGER NOT NULL DEFAULT 0,
    "motifExcedent" TEXT,
    "excedentRegleLe" TIMESTAMP(3),
    "excedentRegleParId" TEXT,
    "motifRegle" TEXT,
    "rejeteParId" TEXT,
    "rejeteLe" TIMESTAMP(3),
    "motifRejet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_payment_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_payment_claim_lines" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "montantDeclare" INTEGER NOT NULL,
    "montantValide" INTEGER,
    "paymentId" TEXT,

    CONSTRAINT "bank_payment_claim_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_payment_proofs" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "fichier" TEXT NOT NULL,
    "nomAffiche" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_bank_accounts_schoolId_actif_idx" ON "school_bank_accounts"("schoolId", "actif");

-- CreateIndex
CREATE INDEX "bank_payment_claims_schoolId_statut_createdAt_idx" ON "bank_payment_claims"("schoolId", "statut", "createdAt");

-- CreateIndex
CREATE INDEX "bank_payment_claims_schoolId_referenceKey_idx" ON "bank_payment_claims"("schoolId", "referenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "bank_payment_claim_lines_paymentId_key" ON "bank_payment_claim_lines"("paymentId");

-- CreateIndex
CREATE INDEX "bank_payment_claim_lines_claimId_idx" ON "bank_payment_claim_lines"("claimId");

-- CreateIndex
CREATE INDEX "bank_payment_claim_lines_invoiceLineId_idx" ON "bank_payment_claim_lines"("invoiceLineId");

-- CreateIndex
CREATE INDEX "bank_payment_proofs_claimId_idx" ON "bank_payment_proofs"("claimId");

-- CreateIndex
CREATE INDEX "bank_payment_proofs_hash_idx" ON "bank_payment_proofs"("hash");

-- AddForeignKey
ALTER TABLE "school_bank_accounts" ADD CONSTRAINT "school_bank_accounts_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_claims" ADD CONSTRAINT "bank_payment_claims_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_claims" ADD CONSTRAINT "bank_payment_claims_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_claims" ADD CONSTRAINT "bank_payment_claims_declaredByUserId_fkey" FOREIGN KEY ("declaredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_claims" ADD CONSTRAINT "bank_payment_claims_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "school_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_claims" ADD CONSTRAINT "bank_payment_claims_confirmeParId_fkey" FOREIGN KEY ("confirmeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_claims" ADD CONSTRAINT "bank_payment_claims_valideParId_fkey" FOREIGN KEY ("valideParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_claim_lines" ADD CONSTRAINT "bank_payment_claim_lines_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "bank_payment_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_claim_lines" ADD CONSTRAINT "bank_payment_claim_lines_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_claim_lines" ADD CONSTRAINT "bank_payment_claim_lines_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_proofs" ADD CONSTRAINT "bank_payment_proofs_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "bank_payment_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Droit réservé : confirmer le crédit d'un paiement par banque après contrôle du relevé. Donné au seul rôle Promoteur
-- (code PRO), s'il existe ; ni la Direction du seed ni l'Administrateur ne l'ont.
INSERT INTO "permissions" ("id", "code", "description")
VALUES ('perm_bank_payment_confirm', 'BANK_PAYMENT_CONFIRM', 'Confirmer le crédit d''un paiement par banque après contrôle du relevé de la banque.')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_bank_payment_confirm_' || r."id", r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'PRO' AND p."code" = 'BANK_PAYMENT_CONFIRM'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

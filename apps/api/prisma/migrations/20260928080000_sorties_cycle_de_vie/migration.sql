-- CreateEnum
CREATE TYPE "ExpensePaymentMode" AS ENUM ('ESPECES', 'VIREMENT', 'CHEQUE', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "ExpenseAttachmentKind" AS ENUM ('JUSTIFICATIF', 'PREUVE_DECAISSEMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExpenseStatus" ADD VALUE 'DECAISSEE';
ALTER TYPE "ExpenseStatus" ADD VALUE 'ANNULEE';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "annuleParId" TEXT,
ADD COLUMN     "beneficiaire" TEXT,
ADD COLUMN     "dateAnnulation" TIMESTAMP(3),
ADD COLUMN     "dateDecaissement" TIMESTAMP(3),
ADD COLUMN     "decaisseParId" TEXT,
ADD COLUMN     "modeDecaissement" "ExpensePaymentMode",
ADD COLUMN     "motifAnnulation" TEXT,
ADD COLUMN     "referenceDecaissement" TEXT;

-- CreateTable
CREATE TABLE "expense_attachments" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "kind" "ExpenseAttachmentKind" NOT NULL,
    "fichier" TEXT NOT NULL,
    "nomAffiche" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "ajouteParId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_attachments_expenseId_idx" ON "expense_attachments"("expenseId");

-- CreateIndex
CREATE INDEX "expenses_schoolId_statut_dateDecaissement_idx" ON "expenses"("schoolId", "statut", "dateDecaissement");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_decaisseParId_fkey" FOREIGN KEY ("decaisseParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_annuleParId_fkey" FOREIGN KEY ("annuleParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_ajouteParId_fkey" FOREIGN KEY ("ajouteParId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


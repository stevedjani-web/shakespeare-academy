-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('EN_ATTENTE', 'CONFIRME', 'ECHOUE', 'A_TRAITER');

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_recuParUserId_fkey";

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "recuParUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "paiementEnLigneActif" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "online_payments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "telephone" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "statut" "OnlinePaymentStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "motifEchec" TEXT,
    "motifCloture" TEXT,
    "clotureParUserId" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_depositId_key" ON "online_payments"("depositId");

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_paymentId_key" ON "online_payments"("paymentId");

-- CreateIndex
CREATE INDEX "online_payments_invoiceLineId_statut_idx" ON "online_payments"("invoiceLineId", "statut");

-- CreateIndex
CREATE INDEX "online_payments_schoolId_statut_idx" ON "online_payments"("schoolId", "statut");

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recuParUserId_fkey" FOREIGN KEY ("recuParUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


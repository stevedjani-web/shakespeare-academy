-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('ESPECES', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('VALIDE', 'ANNULE');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "numeroRecu" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "modePaiement" "PaymentMode" NOT NULL DEFAULT 'ESPECES',
    "referenceExterne" TEXT,
    "datePaiement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recuParUserId" TEXT NOT NULL,
    "statut" "PaymentStatus" NOT NULL DEFAULT 'VALIDE',
    "motifAnnulation" TEXT,
    "annuleParUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_schoolId_numeroRecu_key" ON "payments"("schoolId", "numeroRecu");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recuParUserId_fkey" FOREIGN KEY ("recuParUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_annuleParUserId_fkey" FOREIGN KEY ("annuleParUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('EN_ATTENTE', 'APPROUVEE', 'REJETEE');

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "dateDepense" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" "ExpenseStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "effectueParId" TEXT NOT NULL,
    "approbateurId" TEXT,
    "motifRejet" TEXT,
    "dateDecision" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_effectueParId_fkey" FOREIGN KEY ("effectueParId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approbateurId_fkey" FOREIGN KEY ("approbateurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lot 22 : assistant de rédaction de la messagerie. Additive : éteint par défaut, plafond de 10 $ par mois.
ALTER TABLE "schools" ADD COLUMN "assistantActif" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "schools" ADD COLUMN "assistantPlafondCentimes" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "schools" ADD COLUMN "assistantFaq" TEXT;

CREATE TABLE "assistant_usages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT,
    "modele" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "raison" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "coutMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_usages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistant_usages_createdAt_idx" ON "assistant_usages"("createdAt");
CREATE INDEX "assistant_usages_userId_createdAt_idx" ON "assistant_usages"("userId", "createdAt");

-- Synchronisation hors ligne (D49) : reçu provisoire + clés d'idempotence.
ALTER TABLE "payments" ADD COLUMN "numeroProvisoire" TEXT;
ALTER TABLE "payments" ADD COLUMN "saisieHorsLigneAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "payments_schoolId_numeroProvisoire_key" ON "payments"("schoolId", "numeroProvisoire");

CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_userId_key_key" ON "idempotency_records"("userId", "key");
CREATE INDEX "idempotency_records_createdAt_idx" ON "idempotency_records"("createdAt");

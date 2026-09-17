-- Vérification d'authenticité du reçu (D29) : jeton opaque distinct du numéro de reçu
-- (séquentiel, donc devinable). Colonne ajoutée nullable puis renseignée pour les paiements
-- déjà existants avant de poser la contrainte NOT NULL + UNIQUE.
ALTER TABLE "payments" ADD COLUMN "verificationToken" TEXT;

UPDATE "payments"
SET "verificationToken" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "verificationToken" IS NULL;

ALTER TABLE "payments" ALTER COLUMN "verificationToken" SET NOT NULL;

CREATE UNIQUE INDEX "payments_verificationToken_key" ON "payments"("verificationToken");

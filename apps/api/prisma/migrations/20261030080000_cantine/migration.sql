-- Cantine (30 octobre 2026). Additive : la cantine reste éteinte (cantineActive = false) tant qu'on ne l'allume pas.

-- Réglages de l'école : prix du jour et jours de cantine (lundi, mardi, jeudi).
ALTER TABLE "schools" ADD COLUMN "cantineActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "schools" ADD COLUMN "cantinePrixJourFcfa" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "schools" ADD COLUMN "cantineJours" INTEGER[] DEFAULT ARRAY[1, 2, 4]::INTEGER[];

-- Ligne de facture neutralisée (vente de cantine dont le paiement a été annulé).
ALTER TABLE "invoice_lines" ADD COLUMN "annuleeAt" TIMESTAMP(3);

-- Jours de cantine payés, un par élève inscrit et par date.
CREATE TABLE "canteen_days" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "prixFcfa" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canteen_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "canteen_days_enrollmentId_date_key" ON "canteen_days"("enrollmentId", "date");
CREATE INDEX "canteen_days_schoolId_date_idx" ON "canteen_days"("schoolId", "date");
CREATE INDEX "canteen_days_invoiceLineId_idx" ON "canteen_days"("invoiceLineId");

ALTER TABLE "canteen_days" ADD CONSTRAINT "canteen_days_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "canteen_days" ADD CONSTRAINT "canteen_days_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Droits de la cantine. Idempotent, ne retire rien.
--   CANTEEN_SELL : vendre des jours de cantine à un élève (encaissement). Tout rôle qui encaisse (PAYMENT_CREATE) et la
--   comptabilité (rôle COMPTABLE) le reçoivent.
--   CANTEEN_READ : voir la liste des enfants attendus à la cantine un jour donné (sans aucune donnée financière). Direction,
--   vie scolaire (SURVEILLANT), Administrateur, Promoteur (PRO) et le nouveau rôle CANTINE le reçoivent.
INSERT INTO "permissions" ("id", "code", "description")
VALUES
  ('perm_canteen_sell', 'CANTEEN_SELL', 'Vendre des jours de cantine à un élève (encaissement avec reçu).'),
  ('perm_canteen_read', 'CANTEEN_READ', 'Consulter la liste des enfants attendus à la cantine un jour donné.')
ON CONFLICT ("code") DO NOTHING;

-- Rôle « Cantine » : lecture de la liste du jour, rien d'autre (compte de la cuisine).
INSERT INTO "roles" ("id", "code", "nom", "description", "updatedAt")
VALUES ('role_cantine', 'CANTINE', 'Cantine', 'Liste des enfants attendus à la cantine (lecture seule).', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT DISTINCT 'rp_cs_' || r."id", r."id", p_new."id"
FROM "roles" r
LEFT JOIN "role_permissions" rp ON rp."roleId" = r."id"
LEFT JOIN "permissions" p_old ON p_old."id" = rp."permissionId" AND p_old."code" = 'PAYMENT_CREATE'
CROSS JOIN "permissions" p_new
WHERE p_new."code" = 'CANTEEN_SELL' AND (p_old."id" IS NOT NULL OR r."code" = 'COMPTABLE')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_cr_' || r."id", r."id", p_new."id"
FROM "roles" r
CROSS JOIN "permissions" p_new
WHERE p_new."code" = 'CANTEEN_READ' AND r."code" IN ('DIRECTION', 'SURVEILLANT', 'ADMINISTRATEUR', 'PRO', 'CANTINE')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

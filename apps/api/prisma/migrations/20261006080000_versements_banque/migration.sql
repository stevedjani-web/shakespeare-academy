-- CreateEnum
CREATE TYPE "BankDepositStatus" AS ENUM ('EN_ATTENTE', 'CONFIRME', 'REJETE');

-- CreateTable
CREATE TABLE "bank_deposits" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "dateVersement" TIMESTAMP(3) NOT NULL,
    "banque" TEXT NOT NULL,
    "numeroBordereau" TEXT NOT NULL,
    "note" TEXT,
    "statut" "BankDepositStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "declareParId" TEXT NOT NULL,
    "verifieParId" TEXT,
    "dateVerification" TIMESTAMP(3),
    "motifRejet" TEXT,
    "fichier" TEXT NOT NULL,
    "nomAffiche" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_deposits_schoolId_statut_dateVersement_idx" ON "bank_deposits"("schoolId", "statut", "dateVersement");

-- AddForeignKey
ALTER TABLE "bank_deposits" ADD CONSTRAINT "bank_deposits_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_deposits" ADD CONSTRAINT "bank_deposits_declareParId_fkey" FOREIGN KEY ("declareParId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_deposits" ADD CONSTRAINT "bank_deposits_verifieParId_fkey" FOREIGN KEY ("verifieParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Droits du versement en banque. Idempotent, ne retire rien.
--   BANK_DEPOSIT_CREATE : déclarer un versement avec son bordereau. Tout rôle qui encaisse (PAYMENT_CREATE) ou qui saisit
--   des sorties (EXPENSE_CREATE) le reçoit, rôle sur mesure compris.
--   BANK_DEPOSIT_VERIFY : confirmer ou rejeter un versement (droit réservé à la Direction). Tout rôle qui approuve les
--   sorties (EXPENSE_APPROVE : Direction et Promoteur) le reçoit. Le serveur refuse qu'on vérifie son propre versement.
INSERT INTO "permissions" ("id", "code", "description")
VALUES
  ('perm_bank_deposit_create', 'BANK_DEPOSIT_CREATE', 'Déclarer un versement en banque avec son bordereau.'),
  ('perm_bank_deposit_verify', 'BANK_DEPOSIT_VERIFY', 'Confirmer ou rejeter un versement en banque déclaré.')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT DISTINCT 'rp_bd_create_' || r."id", r."id", p_new."id"
FROM "roles" r
JOIN "role_permissions" rp ON rp."roleId" = r."id"
JOIN "permissions" p_old ON p_old."id" = rp."permissionId" AND p_old."code" IN ('PAYMENT_CREATE', 'EXPENSE_CREATE')
CROSS JOIN "permissions" p_new
WHERE p_new."code" = 'BANK_DEPOSIT_CREATE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_bd_verify_' || r."id", r."id", p_new."id"
FROM "roles" r
JOIN "role_permissions" rp ON rp."roleId" = r."id"
JOIN "permissions" p_old ON p_old."id" = rp."permissionId" AND p_old."code" = 'EXPENSE_APPROVE'
CROSS JOIN "permissions" p_new
WHERE p_new."code" = 'BANK_DEPOSIT_VERIFY'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

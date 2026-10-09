-- Frais de service ajoutés au paiement en ligne d'un parent (couvrent les frais du fournisseur de paiement).
-- Purement additif : taux à 0 par défaut, donc aucun changement de comportement tant qu'un responsable ne le fixe pas.

ALTER TABLE "schools" ADD COLUMN "fraisServiceBp" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "online_payments" ADD COLUMN "fraisService" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "online_payments" ADD COLUMN "tauxFraisBp" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "payments" ADD COLUMN "fraisService" INTEGER NOT NULL DEFAULT 0;

-- Droit réservé : fixer le taux des frais de service. Donné au seul rôle Promoteur (code PRO), s'il existe.
INSERT INTO "permissions" ("id", "code", "description")
VALUES ('perm_online_fee_manage', 'ONLINE_FEE_MANAGE', 'Fixer le taux des frais de service ajoutés aux paiements en ligne des parents.')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_online_fee_' || r."id", r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'PRO' AND p."code" = 'ONLINE_FEE_MANAGE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

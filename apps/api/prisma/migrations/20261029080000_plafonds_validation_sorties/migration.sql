-- Plafonds de validation des sorties : 100 000 XAF par opération et 500 000 XAF par mois pour tout approbateur qui n'a
-- pas le droit EXPENSE_APPROVE_UNLIMITED. Paramétrables (null = pas de limite).
ALTER TABLE "schools" ADD COLUMN "sortieSeuilOperationFcfa" INTEGER DEFAULT 100000,
ADD COLUMN "sortiePlafondMensuelFcfa" INTEGER DEFAULT 500000;

ALTER TABLE "expenses" ADD COLUMN "approuveIllimite" BOOLEAN NOT NULL DEFAULT false;

-- Les sorties déjà approuvées par un compte du rôle Promoteur (code PRO) l'ont été sans plafond : elles ne consomment
-- pas le plafond mensuel des approbations déléguées. Les autres (Direction) comptent.
UPDATE "expenses" e SET "approuveIllimite" = true
FROM "users" u JOIN "roles" r ON r."id" = u."roleId"
WHERE u."id" = e."approbateurId" AND r."code" = 'PRO' AND e."statut" IN ('APPROUVEE', 'DECAISSEE');

-- Droit réservé : approbation illimitée et réglage des plafonds. Donné au seul rôle Promoteur (code PRO), s'il existe.
INSERT INTO "permissions" ("id", "code", "description")
VALUES ('perm_expense_approve_unlimited', 'EXPENSE_APPROVE_UNLIMITED', 'Approuver une sortie sans plafond par opération ni plafond mensuel, et régler ces plafonds.')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_expense_approve_unlimited_' || r."id", r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'PRO' AND p."code" = 'EXPENSE_APPROVE_UNLIMITED'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

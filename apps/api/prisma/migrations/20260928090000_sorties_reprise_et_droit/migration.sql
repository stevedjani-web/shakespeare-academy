-- Sorties financières : cycle demande, approbation, décaissement (28 septembre 2026).
--
-- Cette migration est séparée de la précédente : PostgreSQL interdit d'utiliser une valeur d'enum (ici DECAISSEE)
-- dans la transaction qui vient de l'ajouter. Elle est idempotente et ne retire aucun droit.

-- 1. Reprise de l'historique. Avant ce cycle, une sortie APPROUVEE comptait déjà comme sortie réelle dans la clôture
--    de journée, à sa date de dépense. Pour que les clôtures passées ne changent pas d'un centime, ces sorties
--    deviennent DECAISSEE avec la même date. Aucun mode ni exécutant n'est inventé (colonnes laissées vides) : l'écran
--    les présente comme une reprise de l'historique.
UPDATE "expenses"
SET "statut" = 'DECAISSEE',
    "dateDecaissement" = "dateDepense"
WHERE "statut" = 'APPROUVEE'
  AND "dateDecaissement" IS NULL;

-- 2. Nouveau droit EXPENSE_DISBURSE : confirmer la sortie réelle d'une dépense approuvée. Le serveur refuse que celui qui
--    confirme soit celui qui a approuvé. Tout rôle qui saisissait déjà des sorties (EXPENSE_CREATE) le reçoit, ce qui
--    inclut un rôle sur mesure comme le Promoteur ; la Direction et les autres rôles ne l'ont pas.
INSERT INTO "permissions" ("id", "code", "description")
VALUES (
  'perm_expense_disburse',
  'EXPENSE_DISBURSE',
  'Confirmer la sortie réelle (décaissement) d''une dépense approuvée.'
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_exp_disb_' || r."id", r."id", p_disb."id"
FROM "roles" r
JOIN "role_permissions" rp ON rp."roleId" = r."id"
JOIN "permissions" p_create ON p_create."id" = rp."permissionId" AND p_create."code" = 'EXPENSE_CREATE'
CROSS JOIN "permissions" p_disb
WHERE p_disb."code" = 'EXPENSE_DISBURSE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

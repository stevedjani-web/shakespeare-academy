-- Durcissement des rôles (audit du 21 septembre 2026).
--
-- Le seed réécrit les permissions de chaque rôle, mais il n'est pas rejoué à chaque déploiement : sans cette
-- migration, la production continuerait de refuser toutes les routes financières (FINANCE_READ n'existerait
-- pas) et les enseignants ne pourraient toujours pas faire l'appel. Elle est idempotente (ON CONFLICT) et ne
-- retire jamais un droit existant.

-- 1. Nouvelle permission FINANCE_READ : lire paiements, factures, remises, situation financière, insolvables,
--    tableau de bord financier et exports, sans lire pour autant un dossier d'élève.
INSERT INTO "permissions" ("id", "code", "description")
VALUES (
  'perm_finance_read',
  'FINANCE_READ',
  'Consulter les paiements, factures, remises, la situation financière des élèves, les insolvables, le tableau de bord financier et leurs exports.'
)
ON CONFLICT ("code") DO NOTHING;

-- 2. Tout rôle qui lisait les dossiers d'élèves lisait aussi les finances : on conserve ce comportement, sauf
--    pour la vie scolaire (SURVEILLANT), qui n'en a pas besoin.
INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_fin_' || r."id", r."id", p_fin."id"
FROM "roles" r
JOIN "role_permissions" rp ON rp."roleId" = r."id"
JOIN "permissions" p_stu ON p_stu."id" = rp."permissionId" AND p_stu."code" = 'STUDENT_READ'
CROSS JOIN "permissions" p_fin
WHERE p_fin."code" = 'FINANCE_READ'
  AND r."code" <> 'SURVEILLANT'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 3. Le rôle ENSEIGNANT fait l'appel de ses séances (D60). Sa portée (ses séances seulement) est appliquée
--    par le serveur, pas par cette permission.
INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_att_take_' || r."id", r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'ENSEIGNANT' AND p."code" = 'ATTENDANCE_TAKE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 4. La Direction gère les comptes qui portent des droits réservés (voir auth/reserved-permissions.ts).
INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_usr_mgr_' || r."id", r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'DIRECTION' AND p."code" = 'USER_MANAGE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Points ouverts de l'audit des rôles (23 septembre 2026).
--
-- Le seed n'est pas rejoué à chaque déploiement : sans cette migration, la production ne connaîtrait pas ces deux
-- permissions. Elle est idempotente (ON CONFLICT) et ne retire jamais un droit existant.

-- 1. GUARDIAN_DETAIL_READ : lire la fiche complète d'un responsable (e-mail, adresse, profession). Sans ce droit,
--    un dossier d'élève montre seulement le nom, le lien et le téléphone du responsable.
INSERT INTO "permissions" ("id", "code", "description")
VALUES (
  'perm_guardian_detail_read',
  'GUARDIAN_DETAIL_READ',
  'Lire la fiche complète d''un responsable (e-mail, adresse, profession) ; sans ce droit, un dossier d''élève montre seulement son nom, son lien et son téléphone.'
)
ON CONFLICT ("code") DO NOTHING;

-- Tout rôle qui lisait les dossiers d'élèves garde la fiche complète, sauf la vie scolaire (SURVEILLANT).
INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_gdr_' || r."id", r."id", p_new."id"
FROM "roles" r
JOIN "role_permissions" rp ON rp."roleId" = r."id"
JOIN "permissions" p_stu ON p_stu."id" = rp."permissionId" AND p_stu."code" = 'STUDENT_READ'
CROSS JOIN "permissions" p_new
WHERE p_new."code" = 'GUARDIAN_DETAIL_READ'
  AND r."code" <> 'SURVEILLANT'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 2. SETTINGS_READ : voir dans le menu Établissement, Années scolaires et Structure académique. Les trois rôles de
--    supervision, et tout rôle qui gère déjà l'une de ces trois pages (il perdrait sinon son accès au menu).
INSERT INTO "permissions" ("id", "code", "description")
VALUES (
  'perm_settings_read',
  'SETTINGS_READ',
  'Voir les pages Établissement, Années scolaires et Structure académique (lecture seule).'
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT DISTINCT 'rp_sr_' || r."id", r."id", p_new."id"
FROM "roles" r
LEFT JOIN "role_permissions" rp ON rp."roleId" = r."id"
LEFT JOIN "permissions" p_old ON p_old."id" = rp."permissionId"
  AND p_old."code" IN ('SETTINGS_MANAGE', 'ACADEMIC_YEAR_MANAGE', 'ACADEMIC_STRUCTURE_MANAGE')
CROSS JOIN "permissions" p_new
WHERE p_new."code" = 'SETTINGS_READ'
  AND (r."code" IN ('ADMINISTRATEUR', 'DIRECTION', 'AUDITEUR') OR p_old."id" IS NOT NULL)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

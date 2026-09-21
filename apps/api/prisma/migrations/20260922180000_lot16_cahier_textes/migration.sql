-- Lot 16 : cahier de textes et devoirs (vague 2, D51). Généré par prisma migrate diff, puis complété par les
-- permissions ci-dessous (le seed n'est pas rejoué à chaque déploiement, voir 20260922090000_hardening_roles).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DEVOIR_DONNE';

-- CreateTable
CREATE TABLE "textbook_entries" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "contenu" TEXT,
    "devoirs" TEXT,
    "dateEcheance" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "textbook_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "textbook_entries_classId_date_idx" ON "textbook_entries"("classId", "date");

-- AddForeignKey
ALTER TABLE "textbook_entries" ADD CONSTRAINT "textbook_entries_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "textbook_entries" ADD CONSTRAINT "textbook_entries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "textbook_entries" ADD CONSTRAINT "textbook_entries_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "textbook_entries" ADD CONSTRAINT "textbook_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permissions du lot (idempotent : rejouable, ne retire rien).
INSERT INTO "permissions" ("id", "code", "description") VALUES
  ('perm_textbook_write', 'TEXTBOOK_WRITE', 'Renseigner le cahier de textes de ses classes et matières (contenu des séances et devoirs) ; un enseignant : uniquement ses affectations.'),
  ('perm_textbook_read', 'TEXTBOOK_READ', 'Consulter le cahier de textes et les devoirs de toute l''école.')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_l16_' || r."id" || '_' || p."id", r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON
     (r."code" = 'ENSEIGNANT' AND p."code" = 'TEXTBOOK_WRITE')
  OR (r."code" IN ('DIRECTION', 'ADMINISTRATEUR', 'SURVEILLANT') AND p."code" = 'TEXTBOOK_READ')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

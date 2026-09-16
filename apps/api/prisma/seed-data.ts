import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Catalogue de permissions du Lot 1 (socle : établissement, années, structure académique,
 * utilisateurs/rôles, audit). Les permissions des lots suivants (PAYMENT_CREATE, CASH_CLOSE,
 * EXPENSE_CREATE, …) seront ajoutées ici au fur et à mesure que leurs modules seront construits —
 * volontairement absentes tant qu'aucune route ne les vérifie (voir CLAUDE.md).
 */
export const LOT1_PERMISSIONS = [
  { code: 'SETTINGS_MANAGE', description: "Modifier les paramètres de l'établissement." },
  { code: 'USER_MANAGE', description: 'Créer, modifier, désactiver des utilisateurs et réinitialiser leur mot de passe.' },
  { code: 'ROLE_MANAGE', description: 'Créer des rôles et gérer leurs permissions.' },
  { code: 'ACADEMIC_YEAR_MANAGE', description: 'Créer, activer et clôturer les années scolaires.' },
  { code: 'ACADEMIC_STRUCTURE_MANAGE', description: 'Gérer sections, cycles, niveaux et classes.' },
  { code: 'AUDIT_LOG_READ', description: "Consulter le journal d'audit." },
] as const;

/** Rôles du cahier de cadrage §3, avec leurs permissions du Lot 1 uniquement (voir note ci-dessus). */
export const ROLES: Array<{ code: string; nom: string; description: string; permissions: string[] }> = [
  {
    code: 'ADMINISTRATEUR',
    nom: 'Administrateur',
    description: 'Paramètres, utilisateurs, années, tarifs, classes, caisses, consultation globale.',
    permissions: [
      'SETTINGS_MANAGE',
      'USER_MANAGE',
      'ROLE_MANAGE',
      'ACADEMIC_YEAR_MANAGE',
      'ACADEMIC_STRUCTURE_MANAGE',
      'AUDIT_LOG_READ',
    ],
  },
  {
    code: 'DIRECTION',
    nom: 'Direction',
    description: 'Tableaux de bord, rapports, validation des annulations et écarts.',
    permissions: ['AUDIT_LOG_READ'],
  },
  {
    code: 'SECRETAIRE_CAISSIER',
    nom: 'Secrétaire-caissier',
    description:
      'Élèves, responsables, inscriptions, réinscriptions, encaissements, autres recettes, réimpressions, ouverture et clôture de caisse.',
    permissions: [],
  },
  {
    code: 'COMPTABLE',
    nom: 'Comptable',
    description: 'Sorties, rapports, rapprochements, export.',
    permissions: [],
  },
  {
    code: 'AUDITEUR',
    nom: 'Auditeur lecture seule',
    description: 'Consultation historique et exports.',
    permissions: ['AUDIT_LOG_READ'],
  },
];

export interface SeedOptions {
  schoolName?: string;
  adminEmail?: string;
  adminPassword?: string;
}

/**
 * Idempotent : peut être rejoué sans dupliquer l'établissement, les rôles ou l'administrateur.
 * Utilisé à la fois par le script CLI (`prisma db seed`) et par les fixtures de test e2e,
 * pour ne jamais faire diverger le référentiel de rôles/permissions entre les deux.
 */
export async function seedReferenceData(prisma: PrismaClient, options: SeedOptions = {}) {
  const school = await prisma.school.findFirst();
  const resolvedSchool =
    school ??
    (await prisma.school.create({
      data: { nom: options.schoolName ?? 'Shakespeare Academy' },
    }));

  for (const permission of LOT1_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { description: permission.description },
      create: permission,
    });
  }

  for (const roleDef of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: roleDef.code },
      update: { nom: roleDef.nom, description: roleDef.description },
      create: { code: roleDef.code, nom: roleDef.nom, description: roleDef.description },
    });

    const permissions = await prisma.permission.findMany({ where: { code: { in: roleDef.permissions } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      });
    }
  }

  const adminEmail = options.adminEmail ?? 'admin@shakespeareacademy.cg';
  const existingAdmin = await prisma.user.findFirst({ where: { schoolId: resolvedSchool.id, email: adminEmail } });
  if (!existingAdmin) {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMINISTRATEUR' } });
    const motDePasseHash = await argon2.hash(options.adminPassword ?? 'ChangeMe123!', { type: argon2.argon2id });
    await prisma.user.create({
      data: {
        schoolId: resolvedSchool.id,
        roleId: adminRole.id,
        nom: 'Administrateur',
        prenom: 'Compte',
        email: adminEmail,
        motDePasseHash,
        doitChangerMotDePasse: true,
      },
    });
  }

  return resolvedSchool;
}

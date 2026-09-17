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

/**
 * Catalogue de permissions du Lot 2 (élèves, responsables, inscriptions/réinscriptions — sans
 * paiement). Une seule permission de gestion (`ENROLLMENT_MANAGE`) plutôt qu'une par sous-domaine
 * (élève/responsable/inscription) : le cahier de cadrage §3 regroupe ces trois activités pour le
 * même rôle (Secrétaire-caissier), les séparer maintenant n'apporterait rien de plus fin.
 */
export const LOT2_PERMISSIONS = [
  { code: 'STUDENT_READ', description: 'Consulter les dossiers élèves, responsables et inscriptions.' },
  {
    code: 'ENROLLMENT_MANAGE',
    description: 'Créer/modifier des élèves et responsables, inscrire, réinscrire, annuler une inscription.',
  },
] as const;

/**
 * Catalogue de permissions du Lot 3 (tarifs, factures, tranches, remises, solvabilité).
 * `FEE_MANAGE` couvre la configuration des grilles tarifaires (Administrateur uniquement, cahier §3) ;
 * `DISCOUNT_APPROVE` couvre la validation/rejet d'une remise (Direction/Administrateur, RG06) — distincte
 * de la simple demande de remise, incluse dans `ENROLLMENT_MANAGE` puisque portée par le même rôle
 * opérationnel (Secrétaire-caissier) qui gère déjà les inscriptions et leurs factures associées.
 */
export const LOT3_PERMISSIONS = [
  { code: 'FEE_MANAGE', description: 'Configurer les types de frais, grilles tarifaires et tranches.' },
  { code: 'DISCOUNT_APPROVE', description: 'Approuver ou rejeter une demande de remise.' },
] as const;

/**
 * Catalogue de permissions du Lot 4 (paiements et reçus). Codes repris tels quels du cahier §3
 * (déjà cités en exemple). `PAYMENT_CREATE` couvre l'encaissement ET la réimpression d'un reçu
 * (même geste opérationnel côté Secrétaire-caissier, cahier §3 : "encaissements... réimpressions").
 * `PAYMENT_CANCEL_APPROVE` reste Direction uniquement, même principe que `DISCOUNT_APPROVE` (RG09 :
 * le Secrétaire-caissier ne valide jamais ses propres annulations).
 */
export const LOT4_PERMISSIONS = [
  { code: 'PAYMENT_CREATE', description: 'Encaisser un paiement et imprimer/réimprimer un reçu.' },
  { code: 'PAYMENT_CANCEL_APPROVE', description: 'Approuver l’annulation (correction) d’un paiement validé.' },
] as const;

/**
 * Catalogue de permissions du Lot 5 (sorties financières, clôture de journée). `EXPENSE_CREATE`
 * repris tel quel du cahier §3. `EXPENSE_APPROVE` (Direction uniquement, D25 : toute sortie exige
 * une validation Direction) et `CASH_CLOSE` (accès à l'état de clôture de journée — entrées,
 * sorties, solde) complètent le trio, cohérents avec le rôle Comptable ("sorties, rapports,
 * rapprochements, export", jusqu'ici sans aucune permission réelle).
 */
export const LOT5_PERMISSIONS = [
  { code: 'EXPENSE_CREATE', description: 'Enregistrer une sortie financière (dépense).' },
  { code: 'EXPENSE_APPROVE', description: 'Approuver ou rejeter une sortie financière.' },
  { code: 'CASH_CLOSE', description: "Consulter l'état de clôture de journée (entrées, sorties, solde)." },
] as const;

/** Rôles du cahier de cadrage §3, avec leurs permissions des Lots 1-2 uniquement (voir notes ci-dessus). */
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
      'STUDENT_READ',
      'ENROLLMENT_MANAGE',
      'FEE_MANAGE',
      'PAYMENT_CREATE',
      'CASH_CLOSE',
      'EXPENSE_CREATE',
      // Pas DISCOUNT_APPROVE, PAYMENT_CANCEL_APPROVE ni EXPENSE_APPROVE : D19 (DECISIONS_PENDING.md)
      // tranche explicitement "Direction uniquement" pour l'approbation des remises, même principe
      // pour l'annulation d'un paiement (RG09) et l'approbation d'une sortie (D25) — Administrateur
      // configure/encaisse mais ne valide pas ces opérations, cohérent avec sa description de rôle
      // ("validation des annulations et écarts" reste l'apanage de Direction, pas Administrateur).
    ],
  },
  {
    code: 'DIRECTION',
    nom: 'Direction',
    description: 'Tableaux de bord, rapports, validation des annulations et écarts.',
    permissions: [
      'AUDIT_LOG_READ',
      'STUDENT_READ',
      'DISCOUNT_APPROVE',
      'PAYMENT_CANCEL_APPROVE',
      'EXPENSE_APPROVE',
      'CASH_CLOSE',
    ],
  },
  {
    code: 'SECRETAIRE_CAISSIER',
    nom: 'Secrétaire-caissier',
    description:
      'Élèves, responsables, inscriptions, réinscriptions, encaissements, autres recettes, réimpressions, ouverture et clôture de caisse.',
    permissions: ['STUDENT_READ', 'ENROLLMENT_MANAGE', 'PAYMENT_CREATE', 'CASH_CLOSE'],
  },
  {
    code: 'COMPTABLE',
    nom: 'Comptable',
    description: 'Sorties, rapports, rapprochements, export.',
    permissions: ['STUDENT_READ', 'EXPENSE_CREATE', 'CASH_CLOSE'],
  },
  {
    code: 'AUDITEUR',
    nom: 'Auditeur lecture seule',
    description: 'Consultation historique et exports.',
    permissions: ['AUDIT_LOG_READ', 'STUDENT_READ'],
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

  for (const permission of [
    ...LOT1_PERMISSIONS,
    ...LOT2_PERMISSIONS,
    ...LOT3_PERMISSIONS,
    ...LOT4_PERMISSIONS,
    ...LOT5_PERMISSIONS,
  ]) {
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

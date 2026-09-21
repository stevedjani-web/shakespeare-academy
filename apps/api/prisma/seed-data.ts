import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Catalogue de permissions du Lot 1 (socle : établissement, années, structure académique,
 * utilisateurs/rôles, audit). Les permissions des lots suivants (PAYMENT_CREATE, CASH_CLOSE,
 * EXPENSE_CREATE, …) seront ajoutées ici au fur et à mesure que leurs modules seront construits —
 * volontairement absentes tant qu'aucune route ne les vérifie (voir CLAUDE.md).
 */
export const LOT1_PERMISSIONS = [
  {
    code: 'SETTINGS_MANAGE',
    description: "Modifier les paramètres de l'établissement.",
  },
  {
    code: 'USER_MANAGE',
    description:
      'Créer, modifier, désactiver des utilisateurs et réinitialiser leur mot de passe.',
  },
  {
    code: 'ROLE_MANAGE',
    description: 'Créer des rôles et gérer leurs permissions.',
  },
  {
    code: 'ACADEMIC_YEAR_MANAGE',
    description: 'Créer, activer et clôturer les années scolaires.',
  },
  {
    code: 'ACADEMIC_STRUCTURE_MANAGE',
    description: 'Gérer sections, cycles, niveaux et classes.',
  },
  { code: 'AUDIT_LOG_READ', description: "Consulter le journal d'audit." },
] as const;

/**
 * Catalogue de permissions du Lot 2 (élèves, responsables, inscriptions/réinscriptions — sans
 * paiement). Une seule permission de gestion (`ENROLLMENT_MANAGE`) plutôt qu'une par sous-domaine
 * (élève/responsable/inscription) : le cahier de cadrage §3 regroupe ces trois activités pour le
 * même rôle (Secrétaire-caissier), les séparer maintenant n'apporterait rien de plus fin.
 */
export const LOT2_PERMISSIONS = [
  {
    code: 'STUDENT_READ',
    description: 'Consulter les dossiers élèves, responsables et inscriptions.',
  },
  {
    code: 'ENROLLMENT_MANAGE',
    description:
      'Créer/modifier des élèves et responsables, inscrire, réinscrire, annuler une inscription.',
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
  {
    code: 'FEE_MANAGE',
    description:
      'Configurer les types de frais, grilles tarifaires et tranches.',
  },
  {
    code: 'DISCOUNT_APPROVE',
    description: 'Approuver ou rejeter une demande de remise.',
  },
] as const;

/**
 * Catalogue de permissions du Lot 4 (paiements et reçus). Codes repris tels quels du cahier §3
 * (déjà cités en exemple). `PAYMENT_CREATE` couvre l'encaissement ET la réimpression d'un reçu
 * (même geste opérationnel côté Secrétaire-caissier, cahier §3 : "encaissements... réimpressions").
 * `PAYMENT_CANCEL_APPROVE` reste Direction uniquement, même principe que `DISCOUNT_APPROVE` (RG09 :
 * le Secrétaire-caissier ne valide jamais ses propres annulations).
 */
export const LOT4_PERMISSIONS = [
  {
    code: 'PAYMENT_CREATE',
    description: 'Encaisser un paiement et imprimer/réimprimer un reçu.',
  },
  {
    code: 'PAYMENT_CANCEL_APPROVE',
    description: 'Approuver l’annulation (correction) d’un paiement validé.',
  },
] as const;

/**
 * Catalogue de permissions du Lot 5 (sorties financières, clôture de journée). `EXPENSE_CREATE`
 * repris tel quel du cahier §3. `EXPENSE_APPROVE` (Direction uniquement, D25 : toute sortie exige
 * une validation Direction) et `CASH_CLOSE` (accès à l'état de clôture de journée — entrées,
 * sorties, solde) complètent le trio, cohérents avec le rôle Comptable ("sorties, rapports,
 * rapprochements, export", jusqu'ici sans aucune permission réelle).
 */
export const LOT5_PERMISSIONS = [
  {
    code: 'EXPENSE_CREATE',
    description: 'Enregistrer une sortie financière (dépense).',
  },
  {
    code: 'EXPENSE_APPROVE',
    description: 'Approuver ou rejeter une sortie financière.',
  },
  {
    code: 'CASH_CLOSE',
    description:
      "Consulter l'état de clôture de journée (entrées, sorties, solde).",
  },
] as const;

/**
 * Catalogue de permissions du Lot 7 (vie scolaire : référentiel pédagogique et personnel, addendum
 * v1.1). `PEDAGOGY_MANAGE` couvre la saisie des horaires, matières, enseignants, affectations,
 * calendrier et salles. Les permissions des lots suivants (emploi du temps, appel, pointage...) seront
 * ajoutées avec leurs modules.
 */
export const LOT7_PERMISSIONS = [
  {
    code: 'PEDAGOGY_MANAGE',
    description:
      'Saisir et modifier le référentiel pédagogique : horaires, matières, enseignants, affectations, calendrier, salles.',
  },
] as const;

/**
 * Lot 8 (emploi du temps). `TIMETABLE_READ` ouvre la consultation des emplois du temps publiés ; la
 * saisie, la publication et les changements ponctuels restent sous `PEDAGOGY_MANAGE`.
 */
export const LOT8_PERMISSIONS = [
  {
    code: 'TIMETABLE_READ',
    description:
      'Consulter les emplois du temps publiés (par classe, enseignant ou salle) et leurs changements ponctuels.',
  },
] as const;

/**
 * Lot 9 (assiduité). `ATTENDANCE_TAKE` : faire l'appel ; `ATTENDANCE_CORRECT` : corriger après le
 * verrouillage, saisir et décider les justificatifs ; `ATTENDANCE_READ` : consulter les appels et
 * l'historique d'un élève (données de mineurs : accordée au strict nécessaire, RV12).
 */
export const LOT9_PERMISSIONS = [
  {
    code: 'ATTENDANCE_TAKE',
    description: "Faire l'appel des élèves séance par séance.",
  },
  {
    code: 'ATTENDANCE_CORRECT',
    description:
      "Corriger un appel après son verrouillage (avec motif), saisir et décider les justificatifs d'absence.",
  },
  {
    code: 'ATTENDANCE_READ',
    description:
      "Consulter les appels, les absences et l'historique d'assiduité d'un élève.",
  },
] as const;

/**
 * Lot 10 (pointage des enseignants). `TEACHER_CHECKIN_SELF` : scanner son propre pointage (compte relié à
 * une fiche enseignant) ; `TEACHER_CHECKIN_READ` : consulter les pointages et les heures effectuées ;
 * `TEACHER_CHECKIN_VALIDATE` : valider, rejeter, corriger (jamais son propre pointage, RV06).
 */
export const LOT10_PERMISSIONS = [
  {
    code: 'TEACHER_CHECKIN_SELF',
    description:
      'Pointer sa propre présence en scannant un QR code (début et fin de séance, arrivée et départ).',
  },
  {
    code: 'TEACHER_CHECKIN_READ',
    description:
      'Consulter les pointages des enseignants et le récapitulatif mensuel des heures effectuées.',
  },
  {
    code: 'TEACHER_CHECKIN_VALIDATE',
    description:
      "Valider ou rejeter un pointage d'enseignant, saisir ou corriger un pointage avec un motif (jamais le sien).",
  },
] as const;

/**
 * Lot 11 (portail parent). Les responsables n'ont PAS de rôle ni de permission : leur compte est à part
 * (voir `ParentAccount`). Ces deux permissions sont celles du personnel qui les gère :
 * `PARENT_ACCOUNT_MANAGE` remet les codes d'activation et désactive un compte ; `PARENT_ACCESS_REVOKE`
 * retire ou rétablit l'accès d'un responsable pour un élève (D67 : Direction).
 */
export const LOT11_PERMISSIONS = [
  {
    code: 'PARENT_ACCOUNT_MANAGE',
    description:
      "Remettre les codes d'activation des comptes parents, désactiver ou réactiver un compte.",
  },
  {
    code: 'PARENT_ACCESS_REVOKE',
    description:
      "Retirer ou rétablir, avec motif, l'accès au portail d'un responsable pour un élève donné.",
  },
] as const;

/**
 * Lot 13 (messagerie et annonces). `MESSAGE_USE` : utiliser la messagerie et publier des annonces (enseignants,
 * Direction, vie scolaire) ; un enseignant n'écrit qu'aux responsables des élèves de SES classes (RV09).
 * `MESSAGE_DESK` : tenir le guichet de l'école (Direction et vie scolaire) : écrire à tout responsable et
 * publier pour toute classe. `MESSAGE_SUPERVISE` : lire une conversation (chaque lecture est journalisée, D73),
 * traiter les signalements, retirer un message (D75) : Direction seulement.
 */
export const LOT13_PERMISSIONS = [
  {
    code: 'MESSAGE_USE',
    description:
      'Utiliser la messagerie avec les responsables et publier des annonces pour ses classes.',
  },
  {
    code: 'MESSAGE_DESK',
    description:
      "Tenir le guichet de l'école : écrire à tout responsable et publier une annonce pour toute classe.",
  },
  {
    code: 'MESSAGE_SUPERVISE',
    description:
      'Lire les conversations (lecture journalisée), traiter les signalements et retirer un message avec un motif.',
  },
] as const;

/** Rôles du cahier de cadrage §3, avec leurs permissions des Lots 1-2 uniquement (voir notes ci-dessus). */
export const ROLES: Array<{
  code: string;
  nom: string;
  description: string;
  permissions: string[];
}> = [
  {
    code: 'ADMINISTRATEUR',
    nom: 'Administrateur',
    description:
      'Paramètres, utilisateurs, années, tarifs, classes, caisses, consultation globale.',
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
      'PEDAGOGY_MANAGE',
      'TIMETABLE_READ',
      'ATTENDANCE_TAKE',
      'ATTENDANCE_CORRECT',
      'ATTENDANCE_READ',
      'TEACHER_CHECKIN_READ',
      'TEACHER_CHECKIN_VALIDATE',
      'PARENT_ACCOUNT_MANAGE',
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
    description:
      'Tableaux de bord, rapports, validation des annulations et écarts.',
    permissions: [
      'AUDIT_LOG_READ',
      'STUDENT_READ',
      'DISCOUNT_APPROVE',
      'PAYMENT_CANCEL_APPROVE',
      'EXPENSE_APPROVE',
      'CASH_CLOSE',
      'PEDAGOGY_MANAGE',
      'TIMETABLE_READ',
      'ATTENDANCE_TAKE',
      'ATTENDANCE_CORRECT',
      'ATTENDANCE_READ',
      'TEACHER_CHECKIN_READ',
      'TEACHER_CHECKIN_VALIDATE',
      'PARENT_ACCOUNT_MANAGE',
      'PARENT_ACCESS_REVOKE',
      'MESSAGE_USE',
      'MESSAGE_DESK',
      'MESSAGE_SUPERVISE',
    ],
  },
  {
    code: 'SECRETAIRE_CAISSIER',
    nom: 'Secrétaire-caissier',
    description:
      'Élèves, responsables, inscriptions, réinscriptions, encaissements, autres recettes, réimpressions, ouverture et clôture de caisse.',
    permissions: [
      'STUDENT_READ',
      'ENROLLMENT_MANAGE',
      'PAYMENT_CREATE',
      'CASH_CLOSE',
      'TIMETABLE_READ',
      'PARENT_ACCOUNT_MANAGE',
    ],
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
    permissions: [
      'AUDIT_LOG_READ',
      'STUDENT_READ',
      'TIMETABLE_READ',
      'ATTENDANCE_READ',
      'TEACHER_CHECKIN_READ',
    ],
  },
  {
    code: 'SURVEILLANT',
    nom: 'Surveillant / vie scolaire',
    description:
      "Appel des élèves, correction des présences, justificatifs d'absence (Lot 9).",
    permissions: [
      'STUDENT_READ',
      'TIMETABLE_READ',
      'ATTENDANCE_TAKE',
      'ATTENDANCE_CORRECT',
      'ATTENDANCE_READ',
      'TEACHER_CHECKIN_READ',
      'TEACHER_CHECKIN_VALIDATE',
      'MESSAGE_USE',
      'MESSAGE_DESK',
    ],
  },
  {
    code: 'ENSEIGNANT',
    nom: 'Enseignant',
    description:
      'Son emploi du temps et son pointage par QR code (Lot 10). Compte relié à une fiche enseignant.',
    permissions: ['TIMETABLE_READ', 'TEACHER_CHECKIN_SELF', 'MESSAGE_USE'],
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
export async function seedReferenceData(
  prisma: PrismaClient,
  options: SeedOptions = {},
) {
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
    ...LOT7_PERMISSIONS,
    ...LOT8_PERMISSIONS,
    ...LOT9_PERMISSIONS,
    ...LOT10_PERMISSIONS,
    ...LOT11_PERMISSIONS,
    ...LOT13_PERMISSIONS,
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
      create: {
        code: roleDef.code,
        nom: roleDef.nom,
        description: roleDef.description,
      },
    });

    const permissions = await prisma.permission.findMany({
      where: { code: { in: roleDef.permissions } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      });
    }
  }

  const adminEmail = options.adminEmail ?? 'admin@shakespeareacademy.cg';
  const existingAdmin = await prisma.user.findFirst({
    where: { schoolId: resolvedSchool.id, email: adminEmail },
  });
  if (!existingAdmin) {
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { code: 'ADMINISTRATEUR' },
    });
    const motDePasseHash = await argon2.hash(
      options.adminPassword ?? 'ChangeMe123!',
      { type: argon2.argon2id },
    );
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

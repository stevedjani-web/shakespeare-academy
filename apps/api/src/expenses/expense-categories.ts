// D24 (DECISIONS_PENDING.md), amendée le 28 septembre 2026 : liste fermée mais volontairement pas un enum Postgres
// (voir la note dans schema.prisma), pour rester extensible sans migration. Les libellés sont traduits côté web.
export const EXPENSE_CATEGORY_GROUPS = {
  PERSONNEL: [
    'SALAIRES_ENSEIGNANTS',
    'SALAIRES_ADMINISTRATIF',
    'PRIMES_INDEMNITES',
    'CHARGES_SOCIALES',
    'VACATAIRES_INTERVENANTS',
    'FORMATION_PERSONNEL',
  ],
  FONCTIONNEMENT: [
    'ELECTRICITE',
    'EAU',
    'INTERNET_TELEPHONE',
    'CARBURANT_GROUPE',
    'LOYER',
    'ENTRETIEN_REPARATIONS',
    'NETTOYAGE_HYGIENE',
    'GARDIENNAGE',
    'ASSURANCES',
    'TRANSPORT',
  ],
  PEDAGOGIE: [
    'FOURNITURES',
    'MANUELS_MATERIEL_PEDAGOGIQUE',
    'INFORMATIQUE_LOGICIELS',
    'MOBILIER_EQUIPEMENT',
    'EXAMENS_EVALUATIONS',
    'ACTIVITES_EVENEMENTS',
  ],
  ACHATS_REVENTE: ['ACHAT_TENUES_LIVRES', 'CANTINE_APPROVISIONNEMENT'],
  ADMINISTRATION: [
    'IMPOTS_TAXES',
    'FRAIS_BANCAIRES',
    'HONORAIRES',
    'COMMUNICATION_PUBLICITE',
  ],
  INVESTISSEMENT: ['TRAVAUX_CONSTRUCTION', 'GROS_EQUIPEMENT'],
  // Mouvement de trésorerie, pas une charge : l'argent passe de la caisse à la banque. Il suit le même cycle
  // (demande, approbation, décaissement) et réduit le solde de caisse, mais n'entre jamais dans « dépenses ».
  TRESORERIE: ['VERSEMENT_BANQUE'],
  AUTRE: ['AUTRE'],
} as const;

export const EXPENSE_CATEGORIES = Object.values(
  EXPENSE_CATEGORY_GROUPS,
).flat() as unknown as readonly [string, ...string[]];

/** Catégories d'avant le 28 septembre 2026 : lisibles sur les sorties déjà saisies, plus proposées. */
export const LEGACY_EXPENSE_CATEGORIES = [
  'PAIEMENT_SALAIRE',
  'PAIEMENT_FACTURE',
  'ACHAT_MATERIEL',
] as const;

export type ExpenseCategory = string;

const TREASURY_CATEGORIES: readonly string[] =
  EXPENSE_CATEGORY_GROUPS.TRESORERIE;

/** Un versement en banque n'est pas une dépense d'école : il est présenté à part. */
export function isTreasuryCategory(categorie: string): boolean {
  return TREASURY_CATEGORIES.includes(categorie);
}

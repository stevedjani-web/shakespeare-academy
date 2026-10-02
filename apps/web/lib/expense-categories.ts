import type { MessageKey } from "@/lib/i18n";

// Mêmes codes que `apps/api/src/expenses/expense-categories.ts` : le serveur reste juge, cette liste ne sert qu'à
// proposer les choix, regroupés comme dans un budget d'école.
export const EXPENSE_CATEGORY_GROUPS: ReadonlyArray<{ group: string; codes: readonly string[] }> = [
  { group: "PERSONNEL", codes: ["SALAIRES_ENSEIGNANTS", "SALAIRES_ADMINISTRATIF", "PRIMES_INDEMNITES", "CHARGES_SOCIALES", "VACATAIRES_INTERVENANTS", "FORMATION_PERSONNEL"] },
  { group: "FONCTIONNEMENT", codes: ["ELECTRICITE", "EAU", "INTERNET_TELEPHONE", "CARBURANT_GROUPE", "LOYER", "ENTRETIEN_REPARATIONS", "NETTOYAGE_HYGIENE", "GARDIENNAGE", "ASSURANCES", "TRANSPORT"] },
  { group: "PEDAGOGIE", codes: ["FOURNITURES", "MANUELS_MATERIEL_PEDAGOGIQUE", "INFORMATIQUE_LOGICIELS", "MOBILIER_EQUIPEMENT", "EXAMENS_EVALUATIONS", "ACTIVITES_EVENEMENTS"] },
  { group: "ACHATS_REVENTE", codes: ["ACHAT_TENUES_LIVRES", "CANTINE_APPROVISIONNEMENT"] },
  { group: "ADMINISTRATION", codes: ["IMPOTS_TAXES", "FRAIS_BANCAIRES", "HONORAIRES", "COMMUNICATION_PUBLICITE"] },
  { group: "INVESTISSEMENT", codes: ["TRAVAUX_CONSTRUCTION", "GROS_EQUIPEMENT"] },
  { group: "TRESORERIE", codes: ["VERSEMENT_BANQUE"] },
  { group: "AUTRE", codes: ["AUTRE"] },
];

/** Catégories d'avant le 28 septembre 2026 : lisibles sur les sorties déjà saisies, plus proposées. */
const LEGACY_CATEGORIES = ["PAIEMENT_SALAIRE", "PAIEMENT_FACTURE", "ACHAT_MATERIEL"] as const;

const KNOWN = new Set<string>([...EXPENSE_CATEGORY_GROUPS.flatMap((g) => g.codes), ...LEGACY_CATEGORIES]);

export const categoryKey = (code: string) => `fin.category.${code}` as MessageKey;
export const categoryGroupKey = (group: string) => `fin.categoryGroup.${group}` as MessageKey;

/** Libellé d'une catégorie ; un code inconnu (jamais censé arriver) s'affiche tel quel plutôt que de casser l'écran. */
export function categoryLabel(t: (key: MessageKey) => string, code: string): string {
  return KNOWN.has(code) ? t(categoryKey(code)) : code;
}

export function isTreasuryCategory(code: string): boolean {
  return code === "VERSEMENT_BANQUE";
}

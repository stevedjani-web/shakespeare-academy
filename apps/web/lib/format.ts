// Montants stockés en entier (unité de base de la devise, ex. le franc CFA n'a pas de sous-unité
// courante) — jamais de division/arrondi flottant ici, cohérent avec le choix API (voir CLAUDE.md).
export function formatMontant(amount: number, devise = "FCFA"): string {
  return `${amount.toLocaleString("fr-FR")} ${devise}`;
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("fr-FR");
}

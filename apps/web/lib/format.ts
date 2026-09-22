// Montants stockés en entier (unité de base de la devise, ex. le franc CFA n'a pas de sous-unité
// courante) — jamais de division/arrondi flottant ici, cohérent avec le choix API (voir CLAUDE.md).
export function formatMontant(amount: number, devise = "FCFA"): string {
  return `${amount.toLocaleString("fr-FR")} ${devise}`;
}

// value peut être absente (ex. Student.dateNaissance, facultative depuis le 22 septembre 2026) :
// jamais new Date(null) (renverrait le 1er janvier 1970, une date fausse et jamais signalée comme telle).
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "Non renseignée";
  return new Date(value).toLocaleDateString("fr-FR");
}

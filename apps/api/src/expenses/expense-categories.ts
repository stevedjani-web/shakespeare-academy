// D24 (DECISIONS_PENDING.md) : liste fermée mais volontairement pas un enum Postgres — voir la
// note dans schema.prisma. Catégories confirmées par l'école (17 septembre 2026).
export const EXPENSE_CATEGORIES = [
  'VERSEMENT_BANQUE',
  'PAIEMENT_SALAIRE',
  'PAIEMENT_FACTURE',
  'ACHAT_MATERIEL',
  'AUTRE',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  VERSEMENT_BANQUE: 'Versement banque',
  PAIEMENT_SALAIRE: 'Paiement salaire',
  PAIEMENT_FACTURE: 'Paiement facture',
  ACHAT_MATERIEL: 'Achat matériel',
  AUTRE: 'Autre',
};

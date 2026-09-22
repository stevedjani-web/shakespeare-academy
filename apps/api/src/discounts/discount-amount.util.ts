import type { Discount, InvoiceLine } from '@prisma/client';

/**
 * Montant réellement déduit d'une ligne de facture par ses remises APPROUVEES (RG06) — les
 * remises EN_ATTENTE/REJETEE n'ont aucun effet sur le solde. Toujours plafonné au montant de la
 * ligne (jamais un solde négatif), plusieurs remises approuvées sur une même ligne s'additionnent.
 */
export function computeApprovedDiscountAmount(
  line: InvoiceLine,
  discounts: Discount[],
): number {
  const total = discounts
    .filter((d) => d.statut === 'APPROUVEE')
    .reduce((sum, d) => {
      const amount =
        d.type === 'POURCENTAGE'
          ? Math.round((line.montant * d.valeur) / 100)
          : d.valeur;
      return sum + amount;
    }, 0);
  return Math.min(total, line.montant);
}

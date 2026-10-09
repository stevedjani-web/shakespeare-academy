// Frais de service ajoutés à un paiement en ligne. Même règle que le serveur (src/online-payments/service-fee.util.ts),
// qui reste seul juge du montant réellement débité : ici on ne fait qu'AFFICHER ce que le parent va payer.
// Tout en entiers : taux en centièmes de pour cent (200 = 2 %), frais arrondis à l'XAF supérieur.

export function computeServiceFee(montant: number, bp: number): number {
  if (!Number.isInteger(montant) || montant <= 0) return 0;
  if (!Number.isInteger(bp) || bp <= 0) return 0;
  return Math.floor((montant * bp + 9999) / 10000);
}

/** Pourcentage saisi (« 2 », « 2,5 », « 2.5 ») vers centièmes de pour cent ; null si invalide (hors 0 à 10 ou plus de 2 décimales). */
export function parseRatePercent(input: string): number | null {
  const text = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const bp = Math.round(Number(text) * 100);
  if (bp < 0 || bp > 1000) return null;
  return bp;
}

/** Centièmes de pour cent vers un texte de saisie (200 -> « 2 », 250 -> « 2.5 »). */
export function bpToInput(bp: number): string {
  return String(bp / 100);
}

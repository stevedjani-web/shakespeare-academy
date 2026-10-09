// Frais de service ajoutés au paiement en ligne d'un parent. Tout est en entiers (RG16) : le taux est en centièmes de
// pour cent (200 = 2 %), jamais un flottant, et les frais sont arrondis à l'XAF SUPÉRIEUR (PawaPay n'accepte pas de
// décimales ; arrondir vers le bas ferait toujours perdre quelques XAF à l'école).

/** Plafond du taux réglable (10 %) : garde-fou contre une faute de frappe, pas une règle tarifaire. */
export const MAX_SERVICE_FEE_BP = 1000;

/** Frais pour `montant` XAF au taux `bp` : plafond de montant × bp / 10 000. */
export function computeServiceFee(montant: number, bp: number): number {
  if (!Number.isInteger(montant) || montant <= 0) return 0;
  if (!Number.isInteger(bp) || bp <= 0) return 0;
  return Math.floor((montant * bp + 9999) / 10000);
}

/** Taux en pourcentage lisible (200 -> 2, 250 -> 2.5). */
export function bpToPercent(bp: number): number {
  return bp / 100;
}

/** Pourcentage saisi (2 ou 2.5) vers centièmes de pour cent, en refusant plus de deux décimales. */
export function percentToBp(percent: number): number | null {
  if (!Number.isFinite(percent)) return null;
  const bp = Math.round(percent * 100);
  if (Math.abs(percent * 100 - bp) > 1e-9) return null;
  return bp;
}

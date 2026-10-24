/** Chiffres seuls d'un numéro saisi (espaces, points, « + », parenthèses retirés). */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/**
 * Clé de comparaison d'une ligne : les 9 derniers chiffres (l'indicatif du pays est retiré), ou tous les chiffres s'il y
 * en a 8 ou 9. `null` quand il y a moins de 8 chiffres : ce n'est pas un numéro utilisable pour se connecter.
 */
export function phoneKey(value: string | null | undefined): string | null {
  const digits = phoneDigits(value);
  if (digits.length < 8) return null;
  return digits.length > 9 ? digits.slice(-9) : digits;
}

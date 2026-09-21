// Numéro de paiement au format international sans le plus. Un numéro local de 9 chiffres (le 0 initial fait
// partie du numéro congolais) reçoit l'indicatif 242 ; un numéro déjà en 242 est gardé ; tout autre format
// est refusé plutôt que deviné.
export function normalizeMsisdn(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9) return `242${digits}`;
  if (digits.startsWith('242') && digits.length === 12) return digits;
  return null;
}

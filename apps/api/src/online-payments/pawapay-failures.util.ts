// Codes d'échec PawaPay traduits en phrases pour le parent. Le code brut reste dans les journaux ; un code
// inconnu donne une phrase générique, jamais le texte du fournisseur.
const MESSAGES: Record<string, string> = {
  PAYER_LIMIT_REACHED:
    'La limite de paiement de votre compte Mobile Money est atteinte.',
  INSUFFICIENT_BALANCE: 'Solde insuffisant sur votre compte Mobile Money.',
  PAYMENT_NOT_APPROVED:
    "Le paiement n'a pas été validé sur votre téléphone à temps.",
  PAYER_NOT_FOUND: "Ce numéro n'a pas de compte Mobile Money.",
  TRANSACTION_ALREADY_IN_PROCESS:
    'Un paiement est déjà en cours sur ce numéro.',
  AMOUNT_TOO_SMALL:
    "Le montant est inférieur au minimum accepté par l'opérateur.",
  AMOUNT_TOO_LARGE: "Le montant dépasse le maximum accepté par l'opérateur.",
  INVALID_AMOUNT: "Le montant n'est pas accepté par l'opérateur.",
  INVALID_PHONE_NUMBER: "Ce numéro n'est pas valide.",
  PROVIDER_TEMPORARILY_UNAVAILABLE:
    "L'opérateur est momentanément indisponible. Réessayez plus tard.",
};

export const GENERIC_FAILURE =
  "Le paiement n'a pas abouti. Vous n'avez pas été débité pour cette tentative, réessayez ou contactez le secrétariat.";

export function failureMessage(code?: string): string {
  return (code && MESSAGES[code]) || GENERIC_FAILURE;
}

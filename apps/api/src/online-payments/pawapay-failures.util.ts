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

// Version anglaise des mêmes phrases. Le motif est enregistré en français au moment du retour du
// fournisseur (aucune langue de requête à ce moment-là) : à l'affichage, `localizeFailure` retrouve la
// phrase anglaise correspondante.
const MESSAGES_EN: Record<string, string> = {
  PAYER_LIMIT_REACHED:
    'The payment limit of your Mobile Money account has been reached.',
  INSUFFICIENT_BALANCE: 'Insufficient balance on your Mobile Money account.',
  PAYMENT_NOT_APPROVED: 'The payment was not approved on your phone in time.',
  PAYER_NOT_FOUND: 'This number does not have a Mobile Money account.',
  TRANSACTION_ALREADY_IN_PROCESS:
    'A payment is already in progress on this number.',
  AMOUNT_TOO_SMALL: 'The amount is below the minimum accepted by the operator.',
  AMOUNT_TOO_LARGE: 'The amount is above the maximum accepted by the operator.',
  INVALID_AMOUNT: 'The amount is not accepted by the operator.',
  INVALID_PHONE_NUMBER: 'This number is not valid.',
  PROVIDER_TEMPORARILY_UNAVAILABLE:
    'The operator is temporarily unavailable. Please try again later.',
};

const GENERIC_FAILURE_EN =
  'The payment did not go through. You were not charged for this attempt, please try again or contact the school office.';

/** Phrase d'échec enregistrée (français) rendue dans la langue demandée ; inconnue : renvoyée telle quelle. */
export function localizeFailure(
  stored: string | null,
  lang: 'fr' | 'en',
): string | null {
  if (!stored || lang === 'fr') return stored;
  if (stored === GENERIC_FAILURE) return GENERIC_FAILURE_EN;
  const code = Object.keys(MESSAGES).find((c) => MESSAGES[c] === stored);
  return code ? MESSAGES_EN[code] : stored;
}

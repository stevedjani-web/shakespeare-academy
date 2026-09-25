import { montantEnLettres } from "@/lib/number-to-words-fr";
import { numberToWordsEn } from "@/lib/number-to-words-en";
import { getLocale } from "@/lib/i18n/store";
import type { Locale } from "@/lib/i18n/locales";

/**
 * Montant en toutes lettres dans la langue courante, pour la mention des reçus. `devise` est le code de l'établissement
 * (« XAF » devient « francs CFA » ou « CFA francs »).
 */
export function amountInWords(amount: number, devise: string | undefined, locale: Locale = getLocale()): string {
  const xaf = devise === undefined || devise === "XAF";
  if (locale === "en") return `${numberToWordsEn(amount)} ${xaf ? "CFA francs" : devise}`;
  return montantEnLettres(amount, xaf ? "francs CFA" : devise);
}

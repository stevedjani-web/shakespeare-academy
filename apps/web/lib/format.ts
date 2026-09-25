import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/store";
import { INTL_LOCALE, type Locale } from "@/lib/i18n/locales";

// Montants stockés en entier (unité de base de la devise, ex. le franc CFA n'a pas de sous-unité
// courante) — jamais de division/arrondi flottant ici, cohérent avec le choix API (voir CLAUDE.md).
export function formatMontant(amount: number, devise = "FCFA"): string {
  return `${amount.toLocaleString(INTL_LOCALE[getLocale()])} ${devise}`;
}

// value peut être absente (ex. Student.dateNaissance, facultative depuis le 22 septembre 2026) :
// jamais new Date(null) (renverrait le 1er janvier 1970, une date fausse et jamais signalée comme telle).
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return translate("common.notProvided");
  return new Date(value).toLocaleDateString(INTL_LOCALE[getLocale()]);
}

/** Nom du jour d'une date « AAAA-MM-JJ » dans la langue courante (« Lundi », « Monday »). */
export function weekdayName(iso: string, locale: Locale = getLocale()): string {
  const name = new Date(`${iso}T00:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], { weekday: "long", timeZone: "UTC" });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

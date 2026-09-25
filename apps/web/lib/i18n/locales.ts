export type Locale = "fr" | "en";

export const LOCALES: readonly Locale[] = ["fr", "en"];

/** Langue de repli : celle de l'établissement, et de tout texte pas encore traduit. */
export const DEFAULT_LOCALE: Locale = "fr";

/** Nom de chaque langue dans sa propre langue (jamais traduit : on doit pouvoir la reconnaître). */
export const LOCALE_NAME: Record<Locale, string> = { fr: "Français", en: "English" };

/** Format des dates et des nombres : le français de France, et l'anglais britannique (dates jj/mm/aaaa, comme au Congo). */
export const INTL_LOCALE: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}

/**
 * Langue de l'appareil : la première langue préférée dont la langue de base est prise en charge (« en-US » donne
 * l'anglais, « fr-CG » le français) ; le français si aucune ne l'est.
 */
export function detectLocale(languages: readonly string[] | null | undefined): Locale {
  for (const raw of languages ?? []) {
    const base = raw.trim().toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

import { DEFAULT_LOCALE, detectLocale, isLocale, type Locale } from "@/lib/i18n/locales";

// Langue courante, hors de React pour que les fonctions de mise en forme et les clients d'API la lisent aussi.
// Le choix explicite de l'utilisateur est gardé sur l'appareil ; sans choix, la langue de l'appareil s'applique
// à chaque ouverture (elle suit donc un changement des réglages du téléphone).
const STORAGE_KEY = "sa.lang";

let current: Locale | null = null;
const listeners = new Set<() => void>();

function storedChoice(): Locale | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function resolveInitial(): Locale {
  return storedChoice() ?? detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/** Langue courante. Côté serveur (rendu initial), toujours la langue de repli : le client corrige à l'hydratation. */
export function getLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  if (!current) current = resolveInitial();
  return current;
}

export function getServerLocale(): Locale {
  return DEFAULT_LOCALE;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Change la langue. `remember` garde le choix sur l'appareil : vrai pour un choix de l'utilisateur ou la langue de son
 * compte, faux pour une simple détection.
 */
export function setLocale(locale: Locale, remember = true): void {
  current = locale;
  if (typeof window !== "undefined") {
    if (remember) {
      try {
        window.localStorage.setItem(STORAGE_KEY, locale);
      } catch {
        // Stockage indisponible (navigation privée) : la langue vaut pour cette visite seulement.
      }
    }
    document.documentElement.lang = locale;
  }
  listeners.forEach((l) => l());
}

/** Applique la langue enregistrée sur le compte, si elle existe ; sans elle, on garde celle de l'appareil. */
export function applyAccountLanguage(langue: string | null | undefined): void {
  if (isLocale(langue)) setLocale(langue);
}

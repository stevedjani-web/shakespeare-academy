"use client";

import { LOCALES, LOCALE_NAME, type Locale } from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n/use-i18n";

/**
 * Choix de la langue : le choix s'applique tout de suite et reste sur l'appareil ; `onChoose` l'enregistre en plus sur
 * le compte quand l'utilisateur est connecté (l'échec de cet enregistrement ne gêne jamais le changement de langue).
 */
export function LanguageSwitcher({
  variant = "light",
  onChoose,
  className = "",
}: {
  variant?: "light" | "dark";
  onChoose?: (locale: Locale) => Promise<unknown> | void;
  className?: string;
}) {
  const { locale, t, setLocale } = useI18n();
  const dark = variant === "dark";

  function choose(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    void Promise.resolve(onChoose?.(next)).catch(() => undefined);
  }

  return (
    <div role="group" aria-label={t("lang.choose")} className={`inline-flex rounded-full border p-0.5 text-xs font-semibold ${dark ? "border-white/15 bg-white/5" : "border-border bg-surface"} ${className}`}>
      {LOCALES.map((l) => {
        const selected = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => choose(l)}
            aria-pressed={selected}
            lang={l}
            title={LOCALE_NAME[l]}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              selected ? (dark ? "bg-white text-primary" : "bg-primary text-white") : dark ? "text-white/70 hover:text-white" : "text-ink-muted hover:text-ink"
            }`}
          >
            {l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

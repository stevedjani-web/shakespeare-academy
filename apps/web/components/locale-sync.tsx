"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/use-i18n";

/** Met à jour l'attribut lang de la page (lecteurs d'écran, césure, correcteur) quand la langue change. */
export function LocaleSync() {
  const { locale } = useI18n();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

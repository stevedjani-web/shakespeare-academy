"use client";

import { useCallback, useSyncExternalStore } from "react";
import { translate, type MessageKey, type MessageParams } from "@/lib/i18n";
import { getLocale, getServerLocale, setLocale, subscribeLocale } from "@/lib/i18n/store";

/** Langue courante et fonction de traduction ; le composant est redessiné quand la langue change. */
export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getServerLocale);
  const t = useCallback((key: MessageKey, params?: MessageParams) => translate(key, params, locale), [locale]);
  return { locale, t, setLocale };
}

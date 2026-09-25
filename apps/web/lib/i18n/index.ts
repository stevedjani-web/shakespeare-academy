import { fr, type MessageKey } from "@/lib/i18n/messages/fr";
import { en } from "@/lib/i18n/messages/en";
import { interpolate } from "@/lib/i18n/interpolate";
import { getLocale } from "@/lib/i18n/store";
import type { Locale } from "@/lib/i18n/locales";

export type { MessageKey } from "@/lib/i18n/messages/fr";

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { fr, en };

export type MessageParams = Record<string, string | number>;

/**
 * Texte d'une clé dans une langue. Un texte manquant dans la langue demandée retombe sur le français, jamais sur une
 * clé brute affichée à l'écran ; {nom} est remplacé par la valeur donnée (un paramètre absent laisse {nom} visible).
 */
export function translate(key: MessageKey, params?: MessageParams, locale: Locale = getLocale()): string {
  const template = DICTIONARIES[locale][key] ?? fr[key] ?? key;
  return interpolate(template, params);
}

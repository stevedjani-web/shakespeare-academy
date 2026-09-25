"use client";

import { useCallback, useEffect, useState } from "react";
import { api, isOfflineError } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { translate, type MessageKey } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/store";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import type { AcademicYear, Cycle, Level, Section } from "@/lib/types";

export function describeError(err: unknown): string {
  if (isOfflineError(err)) return translate("sl.err.offline");
  return isApiError(err) ? err.message : translate("common.error");
}

const DAY_KEYS: Record<number, MessageKey> = {
  1: "sl.day.1",
  2: "sl.day.2",
  3: "sl.day.3",
  4: "sl.day.4",
  5: "sl.day.5",
  6: "sl.day.6",
  0: "sl.day.0",
};

/**
 * 0 = dimanche ... 6 = samedi, dans l'ordre d'affichage de la semaine (lundi en premier).
 * `label` est lu à chaque accès (accesseur) : il suit la langue courante, sans figer un texte au chargement du module.
 */
export const WEEK_DAYS: Array<{ value: number; label: string }> = [1, 2, 3, 4, 5, 6, 0].map((value) => ({
  value,
  get label() {
    return translate(DAY_KEYS[value]);
  },
}));

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(INTL_LOCALE[getLocale()], { timeZone: "UTC" });
}

/** Structure académique chargée une fois : sections, cycles, niveaux, années. */
export function useStructure() {
  const [sections, setSections] = useState<Section[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [s, c, l, y] = await Promise.all([
      api.get<Section[]>("/sections"),
      api.get<Cycle[]>("/cycles"),
      api.get<Level[]>("/levels"),
      api.get<AcademicYear[]>("/academic-years"),
    ]);
    setSections(s);
    setCycles(c);
    setLevels(l);
    setYears(y);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload().catch(() => setLoaded(true));
  }, [reload]);

  /** « Francophone, Primaire, CM2 » : de quoi reconnaître un niveau sans ambiguïté. */
  function levelLabel(levelId: string): string {
    const level = levels.find((l) => l.id === levelId);
    if (!level) return translate("sl.levelUnknown");
    const cycle = cycles.find((c) => c.id === level.cycleId);
    const section = sections.find((s) => s.id === cycle?.sectionId);
    return [section?.nom, cycle?.nom, level.nom].filter(Boolean).join(", ");
  }

  const activeYear = years.find((y) => y.statut === "ACTIVE") ?? years[0] ?? null;

  return { sections, cycles, levels, years, activeYear, loaded, reload, levelLabel };
}

export const TAB_HINT = "text-xs text-ink-muted";

"use client";

import { useCallback, useEffect, useState } from "react";
import { api, isOfflineError } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import type { AcademicYear, Cycle, Level, Section } from "@/lib/types";

export function describeError(err: unknown): string {
  if (isOfflineError(err)) return "Cette action nécessite une connexion Internet. Réessayez quand elle sera revenue.";
  return isApiError(err) ? err.message : "Une erreur est survenue.";
}

/** 0 = dimanche ... 6 = samedi, dans l'ordre d'affichage de la semaine (lundi en premier). */
export const WEEK_DAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
];

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { timeZone: "UTC" });
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
    if (!level) return "Niveau inconnu";
    const cycle = cycles.find((c) => c.id === level.cycleId);
    const section = sections.find((s) => s.id === cycle?.sectionId);
    return [section?.nom, cycle?.nom, level.nom].filter(Boolean).join(", ");
  }

  const activeYear = years.find((y) => y.statut === "ACTIVE") ?? years[0] ?? null;

  return { sections, cycles, levels, years, activeYear, loaded, reload, levelLabel };
}

export const TAB_HINT = "text-xs text-ink-muted";

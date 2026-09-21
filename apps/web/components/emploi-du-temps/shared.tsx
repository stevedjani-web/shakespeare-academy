"use client";

import { WEEK_DAYS } from "@/components/vie-scolaire/shared";
import type { TimeSlot } from "@/lib/types";

export type ViewKind = "classe" | "enseignant" | "salle";

export const VIEW_LABELS: Record<ViewKind, string> = {
  classe: "Par classe",
  enseignant: "Par enseignant",
  salle: "Par salle",
};

export function dayLabel(value: number): string {
  return WEEK_DAYS.find((d) => d.value === value)?.label ?? "";
}

/** Jours de classe, dans l'ordre d'affichage de la semaine (lundi en premier). */
export function orderedDays(joursClasse: number[]): Array<{ value: number; label: string }> {
  return WEEK_DAYS.filter((d) => joursClasse.includes(d.value));
}

/** Lignes d'une grille : un créneau par ligne, triés par heure, les créneaux identiques (même plage) fusionnés. */
export function slotRows(slots: TimeSlot[]): Array<{ key: string; heureDebut: string; heureFin: string; libelle: string; type: "COURS" | "PAUSE" }> {
  const byRange = new Map<string, { key: string; heureDebut: string; heureFin: string; libelle: string; type: "COURS" | "PAUSE" }>();
  for (const s of slots) {
    const key = `${s.heureDebut}-${s.heureFin}`;
    if (!byRange.has(key)) byRange.set(key, { key, heureDebut: s.heureDebut, heureFin: s.heureFin, libelle: s.libelle, type: s.type });
  }
  return [...byRange.values()].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
}

export const CELL = "min-w-[8.5rem] border border-border p-1.5 align-top";
export const TH = "border border-border bg-surface-muted px-2 py-1.5 text-left text-xs font-semibold text-ink-muted";

export function shiftWeek(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatIso(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

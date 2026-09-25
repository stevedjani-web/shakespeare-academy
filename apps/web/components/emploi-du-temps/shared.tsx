"use client";

import { translate, type MessageKey } from "@/lib/i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/store";
import type { TimeSlot } from "@/lib/types";

export type ViewKind = "classe" | "enseignant" | "salle";

export const VIEW_KINDS: ViewKind[] = ["classe", "enseignant", "salle"];

const VIEW_KEYS: Record<ViewKind, MessageKey> = {
  classe: "tt.view.classe",
  enseignant: "tt.view.enseignant",
  salle: "tt.view.salle",
};

export function viewLabel(kind: ViewKind): string {
  return translate(VIEW_KEYS[kind]);
}

/** 0 = dimanche ... 6 = samedi ; lundi en premier dans l'affichage de la semaine. */
const DAY_KEYS: Record<number, MessageKey> = {
  1: "tt.day.1",
  2: "tt.day.2",
  3: "tt.day.3",
  4: "tt.day.4",
  5: "tt.day.5",
  6: "tt.day.6",
  0: "tt.day.0",
};
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function dayLabel(value: number): string {
  const key = DAY_KEYS[value];
  return key ? translate(key) : "";
}

/** Jours de classe, dans l'ordre d'affichage de la semaine (lundi en premier). */
export function orderedDays(joursClasse: number[]): Array<{ value: number; label: string }> {
  return DAY_ORDER.filter((v) => joursClasse.includes(v)).map((value) => ({ value, label: dayLabel(value) }));
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
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(INTL_LOCALE[getLocale()], { timeZone: "UTC" });
}

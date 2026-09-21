"use client";

import type { CheckinStatus } from "@/lib/types";

export const STATUS_BADGE: Record<CheckinStatus, { label: string; color: "orange" | "green" | "red" }> = {
  EN_ATTENTE: { label: "À valider", color: "orange" },
  VALIDE: { label: "Validé", color: "green" },
  REJETE: { label: "Rejeté", color: "red" },
};

/** 335 -> « 5 h 35 ». */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

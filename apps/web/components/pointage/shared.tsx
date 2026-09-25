"use client";

import { translate, type MessageKey } from "@/lib/i18n";
import type { CheckinStatus } from "@/lib/types";

export const STATUS_BADGE: Record<CheckinStatus, { key: MessageKey; color: "orange" | "green" | "red" }> = {
  EN_ATTENTE: { key: "tt.ck.status.EN_ATTENTE", color: "orange" },
  VALIDE: { key: "tt.ck.status.VALIDE", color: "green" },
  REJETE: { key: "tt.ck.status.REJETE", color: "red" },
};

/** 335 -> « 5 h 35 ». */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return translate("tt.hoursMinutes", { h, m: String(m).padStart(2, "0") });
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

"use client";

import { useId } from "react";
import { priorityLabel, priorityText, type MessagePriority } from "@/lib/message-priority";
import { useI18n } from "@/lib/i18n/use-i18n";

const SELECTED: Record<MessagePriority, string> = {
  NORMALE: "border-primary bg-primary text-white",
  IMPORTANTE: "border-warning bg-warning-soft text-warning",
  URGENTE: "border-danger bg-danger-soft text-danger",
};

/**
 * Choix de la priorité d'un message. Un parent n'a que Normal et Important (`allowUrgent` faux) : une urgence
 * immédiate (santé, sécurité) passe par un appel, ce que le texte d'aide rappelle.
 */
export function PrioritySelect({
  value,
  onChange,
  allowUrgent,
}: {
  value: MessagePriority;
  onChange: (p: MessagePriority) => void;
  allowUrgent: boolean;
}) {
  const { t } = useI18n();
  const labelId = useId();
  const options: MessagePriority[] = allowUrgent ? ["NORMALE", "IMPORTANTE", "URGENTE"] : ["NORMALE", "IMPORTANTE"];
  return (
    <div>
      <span id={labelId} className="mb-1 block text-xs font-medium text-ink-muted">
        {t("priority.label")}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            onClick={() => onChange(p)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              value === p ? SELECTED[p] : "border-border bg-surface text-ink-muted hover:text-ink"
            }`}
          >
            {priorityText(p)}
          </button>
        ))}
      </div>
      {value !== "NORMALE" && (
        <p className="mt-1 text-xs text-ink-muted">
          {value === "URGENTE" ? t("priority.urgentHint") : t("priority.markedAs", { level: priorityLabel(value) })}
        </p>
      )}
      {!allowUrgent && <p className="mt-1 text-xs text-ink-muted">{t("priority.callSchool")}</p>}
    </div>
  );
}

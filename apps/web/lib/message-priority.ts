import { translate, type MessageKey } from "@/lib/i18n";

export type MessagePriority = "NORMALE" | "IMPORTANTE" | "URGENTE";

// Le libellé écrit accompagne toujours l'icône et la couleur : la couleur seule ne suffit pas (daltonisme).
export const PRIORITY_META: Record<MessagePriority, { emoji: string; badge: "slate" | "orange" | "red" }> = {
  NORMALE: { emoji: "", badge: "slate" },
  IMPORTANTE: { emoji: "❗", badge: "orange" },
  URGENTE: { emoji: "🚨", badge: "red" },
};

export const PRIORITY_RANK: Record<MessagePriority, number> = { NORMALE: 0, IMPORTANTE: 1, URGENTE: 2 };

/** « Normal », « Important », « Urgent » dans la langue courante. */
export function priorityLabel(p: MessagePriority): string {
  return translate(`priority.${p}` as MessageKey);
}

/** Texte du marqueur d'un message : « ❗ Important », « 🚨 Urgent ». */
export function priorityText(p: MessagePriority): string {
  const { emoji } = PRIORITY_META[p];
  return emoji ? `${emoji} ${priorityLabel(p)}` : priorityLabel(p);
}

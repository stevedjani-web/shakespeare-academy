export type MessagePriority = "NORMALE" | "IMPORTANTE" | "URGENTE";

// Le libellé écrit accompagne toujours l'icône et la couleur : la couleur seule ne suffit pas (daltonisme).
export const PRIORITY_META: Record<MessagePriority, { label: string; emoji: string; badge: "slate" | "orange" | "red" }> = {
  NORMALE: { label: "Normal", emoji: "", badge: "slate" },
  IMPORTANTE: { label: "Important", emoji: "❗", badge: "orange" },
  URGENTE: { label: "Urgent", emoji: "🚨", badge: "red" },
};

export const PRIORITY_RANK: Record<MessagePriority, number> = { NORMALE: 0, IMPORTANTE: 1, URGENTE: 2 };

/** Texte du marqueur d'un message : « ❗ Important », « 🚨 Urgent ». */
export function priorityText(p: MessagePriority): string {
  const { emoji, label } = PRIORITY_META[p];
  return emoji ? `${emoji} ${label}` : label;
}

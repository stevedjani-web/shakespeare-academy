import type { MessageKey } from "@/lib/i18n";

export type ParentNotificationType =
  | "ABSENCE"
  | "RETARD"
  | "ENSEIGNANT_ABSENT"
  | "EMPLOI_DU_TEMPS_MODIFIE"
  | "MESSAGE_RECU"
  | "ANNONCE"
  | "BULLETIN_DISPONIBLE"
  | "DEVOIR_DONNE"
  | "DISCIPLINE";

/** Où mène une notification : un message ou une annonce s'ouvre dans sa messagerie, le reste sur la fiche de l'enfant. */
export function notificationTarget(type: ParentNotificationType, childId: string): string {
  if (type === "MESSAGE_RECU") return "/parents/messages";
  if (type === "ANNONCE") return "/parents/annonces";
  return `/parents/enfant/${childId}`;
}

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Titre du bandeau d'alerte : messages non lus et autres notifications non lues, au singulier ou au pluriel. */
export function alertTitle(messages: number, notifications: number, tr: Translate): string {
  const parts: string[] = [];
  if (messages > 0) parts.push(messages === 1 ? tr("parent.alert.msgOne") : tr("parent.alert.msgMany", { n: messages }));
  if (notifications > 0) parts.push(notifications === 1 ? tr("parent.alert.notifOne") : tr("parent.alert.notifMany", { n: notifications }));
  return parts.length === 0 ? "" : tr("parent.alert.have", { parts: parts.join(tr("parent.alert.and")) });
}

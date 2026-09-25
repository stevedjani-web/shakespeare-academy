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

/** Titre du bandeau d'alerte : messages non lus et autres notifications non lues, au singulier ou au pluriel. */
export function alertTitle(messages: number, notifications: number): string {
  const parts: string[] = [];
  if (messages > 0) parts.push(messages === 1 ? "un nouveau message" : `${messages} nouveaux messages`);
  if (notifications > 0) parts.push(notifications === 1 ? "une notification non lue" : `${notifications} notifications non lues`);
  return parts.length === 0 ? "" : `Vous avez ${parts.join(" et ")}`;
}

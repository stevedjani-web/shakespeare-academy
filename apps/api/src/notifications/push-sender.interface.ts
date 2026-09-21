/** Jeton d'injection : l'envoi réel est remplacé par un faux dans les tests (aucun envoi réel en CI). */
export const PUSH_SENDER = Symbol('PUSH_SENDER');

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Contenu d'une alerte push. RV10 : un canal externe ne transporte jamais de contenu sensible, donc
 * jamais de motif, de note ni de montant ici. Le détail reste dans l'application authentifiée.
 */
export interface PushPayload {
  title: string;
  body: string;
  /** Page de l'application à ouvrir au clic. */
  url: string;
  /** Une nouvelle alerte de même étiquette remplace la précédente sur l'appareil. */
  tag?: string;
}

export interface PushResult {
  ok: boolean;
  /** L'abonnement n'existe plus côté navigateur (désinstallation, permission retirée) : à supprimer. */
  expired?: boolean;
  error?: string;
}

export interface PushSender {
  /** Clé publique VAPID à donner au navigateur, ou null si l'envoi push n'est pas configuré. */
  getPublicKey(): string | null;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

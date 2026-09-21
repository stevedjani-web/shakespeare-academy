"use client";

import { isOfflineError, sendWithKey } from "@/lib/api";
import { isOnline } from "@/lib/connectivity";
import { enqueue, newId, processOutbox, type EnqueueInput, type OutboxEntry } from "@/lib/outbox";

export type SubmitResult<T> = { queued: false; result: T } | { queued: true; entry: OutboxEntry };

/**
 * Envoie une saisie ; sans Internet (ou si le réseau lâche en route), la met en file d'attente sur
 * l'appareil pour la synchroniser plus tard. La même clé d'idempotence sert aux deux chemins : si la
 * première tentative avait en fait abouti (réponse perdue), le renvoi ne crée jamais de doublon.
 * Les erreurs de validation du serveur (montant trop élevé, doublon...) remontent normalement.
 *
 * `whenQueued` n'est appelée que si la saisie part réellement en file d'attente : c'est là qu'un
 * encaissement reçoit son numéro de reçu provisoire (jamais consommé pour un paiement passé en ligne).
 */
export async function submitOrQueue<T>(
  input: Omit<EnqueueInput, "key">,
  whenQueued?: () => Partial<EnqueueInput>,
): Promise<SubmitResult<T>> {
  const key = newId();
  if (isOnline()) {
    try {
      const result = await sendWithKey<T>(input.method, input.path, input.body, key);
      return { queued: false, result };
    } catch (err) {
      if (!isOfflineError(err)) throw err;
    }
  }
  const entry = await enqueue({ ...input, ...(whenQueued ? whenQueued() : {}), key });
  void processOutbox();
  return { queued: true, entry };
}

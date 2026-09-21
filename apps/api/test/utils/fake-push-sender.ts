import type {
  PushPayload,
  PushResult,
  PushSender,
  PushTarget,
} from '../../src/notifications/push-sender.interface';

/** Faux service push : enregistre ce qui serait envoyé, ne contacte jamais Internet. */
export class FakePushSender implements PushSender {
  publicKey: string | null = 'BFakePublicKeyForTests';
  sent: Array<{ target: PushTarget; payload: PushPayload }> = [];
  /** `ok` : l'envoi réussit ; `fail` : le service refuse ; `expired` : l'appareil n'existe plus ; `throw` : exception. */
  mode: 'ok' | 'fail' | 'expired' | 'throw' = 'ok';

  reset() {
    this.sent = [];
    this.mode = 'ok';
    this.publicKey = 'BFakePublicKeyForTests';
  }

  getPublicKey() {
    return this.publicKey;
  }

  // Volontairement `async` sans `await` : même signature que le vrai expéditeur, qui attend le réseau.
  // eslint-disable-next-line @typescript-eslint/require-await
  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (this.mode === 'throw')
      throw new Error('Service push injoignable (simulé).');
    if (this.mode === 'fail')
      return { ok: false, error: 'Refus du service push (500).' };
    if (this.mode === 'expired')
      return { ok: false, expired: true, error: 'Abonnement expiré (410).' };
    this.sent.push({ target, payload });
    return { ok: true };
  }
}

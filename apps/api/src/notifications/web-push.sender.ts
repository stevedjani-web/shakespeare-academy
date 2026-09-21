import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import type {
  PushPayload,
  PushResult,
  PushSender,
  PushTarget,
} from './push-sender.interface';

const TTL_SECONDS = 60 * 60;
const TIMEOUT_MS = 8000;

/**
 * Envoi réel par Web Push (standard VAPID), gratuit et sans fournisseur payant (D65). Sans clés
 * configurées, il n'envoie rien et ne lève jamais : l'application fonctionne comme avant, les
 * notifications restent simplement dans l'application.
 */
@Injectable()
export class WebPushSender implements PushSender {
  private readonly logger = new Logger(WebPushSender.name);
  private readonly publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || null;
  private readonly privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || null;
  private readonly subject =
    process.env.VAPID_SUBJECT?.trim() || 'https://academy.lobima.online';
  private configured = false;

  constructor() {
    if (this.publicKey && this.privateKey) {
      try {
        webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
        this.configured = true;
      } catch (err) {
        this.logger.warn(
          `Clés VAPID invalides : les alertes push sont désactivées (${(err as Error).message}).`,
        );
      }
    } else {
      this.logger.warn(
        'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY absentes : les alertes push sont désactivées.',
      );
    }
  }

  getPublicKey(): string | null {
    return this.configured ? this.publicKey : null;
  }

  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (!this.configured)
      return { ok: false, error: 'Envoi push non configuré.' };
    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        JSON.stringify(payload),
        { TTL: TTL_SECONDS, timeout: TIMEOUT_MS },
      );
      return { ok: true };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410)
        return {
          ok: false,
          expired: true,
          error: `Abonnement expiré (${status}).`,
        };
      return {
        ok: false,
        error: status
          ? `Refus du service push (${status}).`
          : (err as Error).message,
      };
    }
  }
}

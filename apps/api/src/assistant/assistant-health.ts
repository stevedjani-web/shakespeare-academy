import { Injectable } from '@nestjs/common';
import type { AssistantFailure } from './assistant-provider.interface';
import { isDurableFailure } from './assistant.util';

/**
 * Santé du prestataire d'IA, en mémoire (un seul serveur). Après une panne DURABLE (crédit épuisé, clé refusée, plafond
 * du prestataire), l'assistant se met en pause quelques minutes : on n'envoie plus d'appels voués à l'échec et les écrans
 * annoncent tout de suite « indisponible », sans attendre un délai à chaque demande. Une panne passagère (saturation,
 * délai) ne met rien en pause. La pause redémarre à zéro avec le serveur : le premier appel qui échoue la rétablit.
 */
@Injectable()
export class AssistantHealth {
  private until = 0;
  private cause: AssistantFailure | null = null;

  /** Durée de la pause après une panne durable (10 minutes par défaut, réglable pour les tests). */
  pauseMs(): number {
    const n = Number(process.env.ASSISTANT_PAUSE_MS);
    return Number.isFinite(n) && n >= 0 && process.env.ASSISTANT_PAUSE_MS
      ? n
      : 10 * 60 * 1000;
  }

  /** Pause en cours : la cause, sinon `null`. */
  paused(now = Date.now()): AssistantFailure | null {
    return this.cause !== null && now < this.until ? this.cause : null;
  }

  /** Vrai si cet échec vient de déclencher une pause (pas s'il la prolonge). */
  failed(reason: AssistantFailure, now = Date.now()): boolean {
    if (!isDurableFailure(reason)) return false;
    const wasPaused = this.paused(now) !== null;
    this.cause = reason;
    this.until = now + this.pauseMs();
    return !wasPaused;
  }

  /** Vrai si l'assistant sortait d'une panne durable. */
  succeeded(): boolean {
    const was = this.cause !== null;
    this.cause = null;
    this.until = 0;
    return was;
  }

  /** Dernière panne durable connue, même si sa pause est finie (pour l'écran de la Direction). */
  lastDurable(): AssistantFailure | null {
    return this.cause;
  }

  reset(): void {
    this.cause = null;
    this.until = 0;
  }
}

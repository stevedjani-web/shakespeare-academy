import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { pick } from '../common/language';

/**
 * Limite le nombre de demandes de préinscription déposées depuis une même adresse : le formulaire est public et
 * accepte des fichiers, il ne doit pas servir à remplir le disque. En mémoire (un seul processus, une seule école) :
 * la limite se remet à zéro au redémarrage, ce qui est acceptable pour ce garde-fou.
 * Réglable par `PREINSCRIPTION_LIMITE_PAR_HEURE` (10 par défaut), lue à chaque appel.
 */
@Injectable()
export class SubmissionRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private static readonly WINDOW_MS = 60 * 60 * 1000;

  private limit(): number {
    const n = Number(process.env.PREINSCRIPTION_LIMITE_PAR_HEURE);
    return Number.isInteger(n) && n > 0 ? n : 10;
  }

  /** Compte un dépôt pour cette adresse ; refuse (429) au-delà de la limite. */
  assert(key: string, now = Date.now()) {
    const since = now - SubmissionRateLimiter.WINDOW_MS;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.limit()) {
      this.hits.set(key, recent);
      throw new HttpException(
        pick({
          fr: 'Trop de demandes depuis cette connexion. Réessayez dans une heure ou contactez le secrétariat.',
          en: 'Too many requests from this connection. Try again in an hour or contact the school office.',
        }),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Ménage : on oublie les adresses inactives pour que la table ne grossisse pas indéfiniment.
    if (this.hits.size > 5000) {
      for (const [k, list] of this.hits) {
        if (list.every((t) => t <= since)) this.hits.delete(k);
      }
    }
  }
}

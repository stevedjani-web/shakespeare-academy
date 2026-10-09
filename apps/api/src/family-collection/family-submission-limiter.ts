import { Injectable } from '@nestjs/common';
import { SubmissionRateLimiter } from '../pre-registrations/submission-rate-limiter';

/**
 * Limite les envois du formulaire public de collecte, par adresse. Plus large que celle de la préinscription : dans un
 * groupe de classe, des dizaines de parents écrivent en même temps, souvent derrière la même adresse d'opérateur mobile.
 * Réglable par `COLLECTE_LIMITE_PAR_HEURE` (40 par défaut), lue à chaque appel. Compteur propre (autre instance).
 */
@Injectable()
export class FamilySubmissionLimiter extends SubmissionRateLimiter {
  protected override limit(): number {
    const n = Number(process.env.COLLECTE_LIMITE_PAR_HEURE);
    return Number.isInteger(n) && n > 0 ? n : 40;
  }
}

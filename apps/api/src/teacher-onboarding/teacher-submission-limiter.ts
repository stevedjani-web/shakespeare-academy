import { Injectable } from '@nestjs/common';
import { SubmissionRateLimiter } from '../pre-registrations/submission-rate-limiter';

/**
 * Limite les envois du formulaire public des enseignants, par adresse. Réglable par
 * `COLLECTE_ENSEIGNANTS_LIMITE_PAR_HEURE` (20 par défaut), lue à chaque appel. Compteur propre à ce formulaire.
 */
@Injectable()
export class TeacherSubmissionLimiter extends SubmissionRateLimiter {
  protected override limit(): number {
    const n = Number(process.env.COLLECTE_ENSEIGNANTS_LIMITE_PAR_HEURE);
    return Number.isInteger(n) && n > 0 ? n : 20;
  }
}

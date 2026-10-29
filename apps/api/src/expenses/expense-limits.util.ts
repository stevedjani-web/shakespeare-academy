import { dayInTimezone } from '../attendance/attendance.util';

/**
 * Plafonds de validation des sorties (29 octobre 2026). Valables pour tout approbateur qui n'a pas le droit
 * EXPENSE_APPROVE_UNLIMITED (le Promoteur). Montants entiers en XAF (RG16) ; `null` = pas de limite.
 */
export interface ExpenseLimits {
  seuilOperation: number | null;
  plafondMensuel: number | null;
}

/** Mois d'un instant dans le fuseau de l'établissement, « AAAA-MM ». */
export function monthKey(instant: Date, timeZone: string): string {
  return dayInTimezone(instant, timeZone).slice(0, 7);
}

export type LimitVerdict =
  | { ok: true }
  | { ok: false; raison: 'OPERATION'; seuil: number }
  | { ok: false; raison: 'MENSUEL'; plafond: number; reste: number };

/**
 * Une approbation déléguée passe si le montant ne dépasse pas le seuil par opération (égal au seuil : accepté) et si le
 * total déjà validé ce mois-ci, ce montant compris, ne dépasse pas le plafond mensuel (égal au plafond : accepté).
 */
export function checkApprovalLimits(
  montant: number,
  limits: ExpenseLimits,
  utiliseMois: number,
): LimitVerdict {
  if (limits.seuilOperation !== null && montant > limits.seuilOperation) {
    return { ok: false, raison: 'OPERATION', seuil: limits.seuilOperation };
  }
  if (limits.plafondMensuel !== null) {
    const reste = Math.max(0, limits.plafondMensuel - utiliseMois);
    if (montant > reste) {
      return {
        ok: false,
        raison: 'MENSUEL',
        plafond: limits.plafondMensuel,
        reste,
      };
    }
  }
  return { ok: true };
}

/** 100000 -> « 100 000 » (espace insécable ordinaire, comme l'affichage de l'application). */
export function formatXaf(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

import { ForbiddenException } from '@nestjs/common';

/**
 * Permissions réservées à la Direction (D19 : remises, RG09 : annulation d'un paiement, D25 : sorties, D67 :
 * accès des parents, D73/D75 : supervision de la messagerie, RV12 : pilotage sur des données de mineurs).
 *
 * Sans garde-fou, l'Administrateur (qui gère les rôles et les comptes) pourrait s'accorder ces droits en
 * modifiant son propre rôle, ou créer un compte Direction et s'en servir : la séparation des tâches ne
 * tiendrait que sur le papier. Règle : on ne peut ni accorder, ni retirer, ni faire porter à un compte un droit
 * réservé qu'on ne détient pas soi-même. Les autres permissions restent librement gérables.
 */
export const RESERVED_PERMISSIONS = [
  'DISCOUNT_APPROVE',
  'PAYMENT_CANCEL_APPROVE',
  'EXPENSE_APPROVE',
  'PARENT_ACCESS_REVOKE',
  'MESSAGE_SUPERVISE',
  'PILOTAGE_READ',
] as const;

const RESERVED = new Set<string>(RESERVED_PERMISSIONS);

/** Droits réservés parmi `involved` que l'acteur ne détient pas. */
export function reservedMissing(
  actorPermissions: readonly string[],
  involved: Iterable<string>,
): string[] {
  const held = new Set(actorPermissions);
  return [...new Set(involved)].filter((p) => RESERVED.has(p) && !held.has(p));
}

/** Refuse (403) si l'action touche un droit réservé que l'acteur ne détient pas. */
export function assertCanHandleReserved(
  actorPermissions: readonly string[],
  involved: Iterable<string>,
  action: string,
): void {
  const missing = reservedMissing(actorPermissions, involved);
  if (missing.length > 0) {
    throw new ForbiddenException(
      `Vous ne pouvez pas ${action} : cela met en jeu des droits réservés à la Direction (${missing.join(', ')}).`,
    );
  }
}

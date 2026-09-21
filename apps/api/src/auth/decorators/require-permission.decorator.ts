import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Exige une permission précise (jamais un rôle) pour accéder à la route.
 * Le contrôle est toujours vérifié côté serveur, y compris pour un appel API direct (CA14) :
 * masquer un bouton côté client ne constitue jamais une sécurité (§14 du cahier de cadrage).
 */
export const RequirePermission = (code: string) =>
  SetMetadata(PERMISSION_KEY, code);

export const ANY_PERMISSION_KEY = 'requiredAnyPermission';

/**
 * Exige AU MOINS UNE des permissions listées. Sert aux routes que deux profils partagent avec une portée
 * différente (ex. l'appel : la vie scolaire le lit en entier, un enseignant seulement ses séances) : le
 * contrôleur ouvre la route, le service applique la portée.
 */
export const RequireAnyPermission = (...codes: string[]) =>
  SetMetadata(ANY_PERMISSION_KEY, codes);

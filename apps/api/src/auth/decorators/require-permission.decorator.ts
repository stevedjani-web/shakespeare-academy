import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Exige une permission précise (jamais un rôle) pour accéder à la route.
 * Le contrôle est toujours vérifié côté serveur, y compris pour un appel API direct (CA14) :
 * masquer un bouton côté client ne constitue jamais une sécurité (§14 du cahier de cadrage).
 */
export const RequirePermission = (code: string) =>
  SetMetadata(PERMISSION_KEY, code);

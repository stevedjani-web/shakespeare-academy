/**
 * Version des conditions d'usage affichées à l'enseignant qui envoie ses informations. À garder identique à celle de la
 * page web (`apps/web/lib/staff-privacy.ts`) : une version périmée est refusée à l'envoi.
 */
export const STAFF_CONSENT_VERSION = '2026-10-staff-v2';

/** Rôle des comptes créés à la validation d'une demande : aucun droit réservé, jamais choisi par le demandeur. */
export const TEACHER_ROLE_CODE = 'ENSEIGNANT';

/** Validité par défaut du lien partagé, en jours (réglable à la création). */
export const LINK_DEFAULT_DAYS = 30;
export const LINK_MAX_DAYS = 90;

/** Au-delà de ce délai une demande non traitée ne sert plus à reconnaître un enseignant qui essaie de se connecter. */
export const PENDING_LOGIN_HINT_DAYS = 90;

/** Nombre de classes qu'un enseignant peut déclarer dans sa demande. */
export const MAX_DECLARED_CLASSES = 15;

/**
 * Cycles du secondaire : un enseignant y intervient par matière (on lui demande donc ses matières), alors qu'en maternelle
 * et en primaire il est titulaire de sa classe. Décidé ici, côté serveur, d'après le code du cycle : la page web ne fait que
 * lire le résultat.
 */
const SECONDARY_CYCLE_CODES = new Set([
  'COLLEGE',
  'LYCEE',
  'SECONDAIRE',
  'SECONDARY',
  'HIGH_SCHOOL',
  'HIGHSCHOOL',
]);

export function isSecondaryCycle(code: string): boolean {
  const normalized = code
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return SECONDARY_CYCLE_CODES.has(normalized);
}

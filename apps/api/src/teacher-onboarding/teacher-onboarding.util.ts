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

/** Matières « autres » (texte libre) qu'un enseignant peut ajouter, et longueur de chacune. */
export const MAX_OTHER_SUBJECTS = 5;
export const MAX_OTHER_SUBJECT_LENGTH = 60;

/** Clé de comparaison d'un nom de matière : accents, casse, espaces et ponctuation ignorés. */
export function subjectKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Nettoie les matières tapées à la main : espaces réduits, vides retirés, doublons retirés (accents et casse ignorés),
 * `MAX_OTHER_SUBJECTS` au plus. Une longueur excessive est refusée en amont par le DTO.
 */
export function cleanOtherSubjects(raw: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw ?? []) {
    const name = value.replace(/\s+/g, ' ').trim();
    const key = subjectKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_OTHER_SUBJECTS) break;
  }
  return out;
}

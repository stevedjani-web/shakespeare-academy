import { createHash, createHmac, randomInt } from 'crypto';

/** Version de la politique de confidentialité que le responsable accepte à l'activation (D76). */
export const CONSENT_VERSION = '2026-09-v6';

/** Alphabet du code d'activation : sans 0/O, 1/I/L, faciles à confondre quand on le dicte ou le recopie. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const MAX_CODE_ATTEMPTS = 5;

/** Code lisible, en deux groupes de quatre : « K7MQ-2XPA ». */
export function generateActivationCode(): string {
  const chars = Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  );
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** Ce que le responsable saisit : majuscules, sans tiret ni espace. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashCode(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

/** Chiffres seuls d'un numéro : « +242 06 123 45 67 » et « 061234567 » se comparent. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Deux numéros désignent-ils la même ligne ? Égalité des chiffres, ou l'un est l'autre précédé d'un indicatif
 * de pays (le plus court doit garder au moins 8 chiffres pour ne pas confondre deux numéros différents).
 */
export function samePhone(a: string, b: string): boolean {
  const x = phoneDigits(a);
  const y = phoneDigits(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 8 && long.endsWith(short);
}

/**
 * Clé de signature des jetons des parents : dérivée de celle du personnel mais différente. Un jeton du
 * personnel ne se vérifie donc pas comme jeton de parent, ni l'inverse.
 */
export function parentTokenSecret(): string {
  return createHmac('sha256', process.env.JWT_ACCESS_SECRET ?? '')
    .update('portail-parents')
    .digest('hex');
}

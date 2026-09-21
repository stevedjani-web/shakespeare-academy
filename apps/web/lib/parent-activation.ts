// Mise en service des parents (Lot 18) : ce dont la lettre et le message WhatsApp ont besoin. Fonctions pures.

export interface ActivationLetter {
  guardianId: string;
  nom: string;
  prenom: string;
  telephone: string;
  code: string;
  expireLe: string;
  enfants: Array<{ prenom: string; nom: string; classe: string | null }>;
}

export interface BulkCodesResult {
  validiteJours: number;
  expireLe: string;
  generes: ActivationLetter[];
  ignores: { avecCompte: number; codeEnAttente: number; sansAcces: number };
}

export interface OnboardingSummary {
  total: number;
  actifs: number;
  desactives: number;
  codesEnAttente: number;
  sansCode: number;
  sansAcces: number;
  classes: Array<{ classId: string; classe: string; total: number; actifs: number; desactives: number; codesEnAttente: number; sansCode: number }>;
}

/** Indicatif de pays ajouté à un numéro local de 9 chiffres (le 0 initial fait partie du numéro congolais). */
const DEFAULT_COUNTRY = "242";

/**
 * Numéro utilisable par wa.me : chiffres seuls, international, sans le plus. Un numéro local de 9 chiffres reçoit l'indicatif
 * de l'école ; un numéro déjà international (11 chiffres ou plus) est gardé. Sinon null : mieux vaut pas de lien qu'un lien
 * vers un mauvais numéro.
 */
export function whatsappDigits(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) return `${DEFAULT_COUNTRY}${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** Adresse d'activation, avec téléphone et code dans le FRAGMENT : un fragment n'est jamais envoyé à un serveur. */
export function activationUrl(origin: string, telephone?: string, code?: string): string {
  const base = `${origin}/parents/activer`;
  if (!telephone || !code) return base;
  return `${base}#tel=${encodeURIComponent(telephone)}&code=${encodeURIComponent(code)}`;
}

/** Lit le fragment d'une adresse d'activation : `#tel=...&code=...`. */
export function parseActivationHash(hash: string): { telephone?: string; code?: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const telephone = params.get("tel") ?? undefined;
  const code = params.get("code") ?? undefined;
  return { ...(telephone ? { telephone } : {}), ...(code ? { code } : {}) };
}

function frDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Message WhatsApp bilingue, prêt à envoyer. Envoi toujours manuel : l'école clique. */
export function whatsappMessage(schoolName: string, letter: ActivationLetter, origin: string): string {
  const date = frDate(letter.expireLe);
  const url = activationUrl(origin, letter.telephone, letter.code);
  return (
    `${schoolName} : votre code d'activation de l'Espace Parents est ${letter.code} (valable jusqu'au ${date}, à usage unique). ` +
    `Activez votre compte ici : ${url}\n\n` +
    `${schoolName}: your Parents Portal activation code is ${letter.code} (valid until ${date}, single use). ` +
    `Activate your account here: ${url}`
  );
}

/** Lien wa.me vers ce responsable avec le message prêt, ou null si son numéro est inutilisable. */
export function whatsappLink(schoolName: string, letter: ActivationLetter, origin: string): string | null {
  const digits = whatsappDigits(letter.telephone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(whatsappMessage(schoolName, letter, origin))}`;
}

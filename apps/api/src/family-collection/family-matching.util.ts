import { normalizeText } from '../common/normalize-text.util';

/**
 * Rapprochement du nom tapé par un parent avec les élèves d'une classe (D185). Le parent ne voit jamais la liste : c'est le
 * serveur qui propose, le secrétariat qui confirme. Accents, casse, tirets, ponctuation et ordre nom/prénom sont ignorés
 * (un parent inverse souvent les deux).
 */
export type NameMatch = 'EXACT' | 'PROBABLE' | 'AUCUN';

/** « Éloïse  Ndong-Mba » devient {"ELOISE", "NDONG", "MBA"}. */
export function nameTokens(...parts: Array<string | null | undefined>) {
  const text = normalizeText(parts.filter(Boolean).join(' '));
  return new Set(
    text
      .replace(/[^A-Z0-9]+/g, ' ')
      .split(' ')
      .filter((t) => t.length > 0),
  );
}

/**
 * EXACT : mêmes mots (dans n'importe quel ordre). PROBABLE : au moins deux mots en commun mais pas tous (un prénom
 * composé écrit en partie, un second prénom oublié). Un seul mot en commun ne suffit pas : trop de faux rapprochements.
 */
export function matchNames(
  typed: { nom: string; prenom: string },
  student: { nom: string; prenom: string },
): NameMatch {
  const a = nameTokens(typed.nom, typed.prenom);
  const b = nameTokens(student.nom, student.prenom);
  if (a.size === 0 || b.size === 0) return 'AUCUN';
  const common = [...a].filter((t) => b.has(t)).length;
  if (common === a.size && common === b.size) return 'EXACT';
  if (common >= 2) return 'PROBABLE';
  return 'AUCUN';
}

/** Chiffres seuls d'un numéro (« +242 06 123 45 67 » donne « 242061234567 »). */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Même ligne téléphonique : mêmes chiffres, ou l'un est l'autre précédé d'un indicatif (8 chiffres au moins). */
export function samePhoneNumber(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = phoneDigits(a);
  const y = phoneDigits(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 8 && long.endsWith(short);
}

/** Comparaison de deux valeurs textuelles facultatives : casse, accents et espaces ignorés. */
export function sameText(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (
    nameTokens(a).size > 0 &&
    [...nameTokens(a)].join(' ') === [...nameTokens(b)].join(' ')
  );
}

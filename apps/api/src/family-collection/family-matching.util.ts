import { normalizeText } from '../common/normalize-text.util';

/**
 * Rapprochement du nom tapé par un parent avec les élèves d'une classe (D185). Le parent ne voit jamais la liste : c'est le
 * serveur qui propose, le secrétariat qui confirme. Accents, casse, tirets, ponctuation et ordre nom/prénom sont ignorés
 * (un parent inverse souvent les deux).
 */
export type NameMatch = 'EXACT' | 'PROBABLE' | 'ORTHOGRAPHE' | 'AUCUN';

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

/** Distance de Levenshtein : nombre de lettres à changer, ajouter ou retirer pour passer d'un mot à l'autre. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return prev[b.length];
}

/**
 * Deux mots écrits presque pareil (faute de frappe, lettre en plus, « Khloé » pour « Chloé ») : une lettre d'écart pour les
 * mots de 4 lettres ou plus, deux pour ceux de 6 lettres ou plus. Les mots courts ne sont jamais rapprochés ainsi.
 */
export function closeWords(x: string, y: string): boolean {
  if (x === y) return true;
  const shortest = Math.min(x.length, y.length);
  if (shortest < 4) return false;
  const distance = editDistance(x, y);
  return distance <= 1 || (shortest >= 6 && distance <= 2);
}

/**
 * EXACT : mêmes mots (dans n'importe quel ordre). PROBABLE : au moins deux mots en commun mais pas tous (un prénom
 * composé écrit en partie, un second prénom oublié). Un seul mot en commun ne suffit pas : trop de faux rapprochements.
 * ORTHOGRAPHE : pas deux mots identiques, mais au moins deux mots écrits presque pareil : c'est peut-être le même enfant
 * avec une faute de frappe. Jamais sûr : le secrétariat vérifie et confirme.
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
  // Chaque mot de l'autre côté ne sert qu'une fois : « Kaba Kaba » ne ressemble pas à « Kaba Khloé ».
  const free = [...b];
  let similar = 0;
  for (const word of a) {
    const at = free.findIndex((other) => closeWords(word, other));
    if (at >= 0) {
      similar++;
      free.splice(at, 1);
    }
  }
  return similar >= 2 ? 'ORTHOGRAPHE' : 'AUCUN';
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

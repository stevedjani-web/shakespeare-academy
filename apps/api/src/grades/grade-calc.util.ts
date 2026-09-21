/**
 * Calculs des moyennes et des rangs (Lot 15). Fonctions pures : aucune base de données, aucune valeur métier
 * codée en dur (barème, coefficients et tranches de lettres viennent des paramètres).
 *
 * Règles (à valider par la Direction, voir DECISIONS_PENDING.md) :
 * - une note est ramenée sur 20 avant d'être moyennée ;
 * - un élève absent ou dispensé à une évaluation en est exclu : sa note n'est JAMAIS comptée 0 ;
 * - sans aucune note, il n'y a pas de moyenne (`null`), jamais 0 ;
 * - les moyennes sont arrondies à 2 décimales et le rang se calcule sur la valeur arrondie, pour que ce qui est
 *   imprimé sur le bulletin soit exactement ce qui a servi à classer.
 */

export type GradeStatusValue = 'NOTE' | 'ABSENT' | 'DISPENSE';

export interface GradeEntry {
  /** Coefficient de l'évaluation dans la moyenne de sa matière. */
  coefficient: number;
  /** Note maximale de l'évaluation. */
  bareme: number;
  /** Absent : l'élève n'a pas de ligne de note pour cette évaluation. */
  statut?: GradeStatusValue;
  valeur?: number | null;
}

/** Arrondi à 2 décimales (moitié vers le haut), sans erreur de flottant du type 1.005. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Moyenne pondérée sur 20 des évaluations notées d'une matière ; `null` si aucune n'est notée. */
export function subjectAverage(entries: GradeEntry[]): number | null {
  let weighted = 0;
  let weights = 0;
  for (const e of entries) {
    if (e.statut !== 'NOTE' || e.valeur === null || e.valeur === undefined)
      continue;
    if (e.bareme <= 0 || e.coefficient <= 0) continue;
    weighted += (e.valeur / e.bareme) * 20 * e.coefficient;
    weights += e.coefficient;
  }
  return weights > 0 ? round2(weighted / weights) : null;
}

export interface SubjectResult {
  coefficient: number;
  moyenne: number | null;
}

/** Moyenne générale : moyenne des matières (déjà arrondies) pondérée par leur coefficient ; `null` si aucune. */
export function generalAverage(subjects: SubjectResult[]): number | null {
  let weighted = 0;
  let weights = 0;
  for (const s of subjects) {
    if (s.moyenne === null || s.coefficient <= 0) continue;
    weighted += s.moyenne * s.coefficient;
    weights += s.coefficient;
  }
  return weights > 0 ? round2(weighted / weights) : null;
}

/**
 * Rang « à la compétition » : 1, 2, 2, 4. Deux élèves à égalité (valeurs arrondies identiques) ont le même rang et
 * le suivant saute. Un élève sans moyenne n'est pas classé (`null`).
 */
export function rankAll(
  items: Array<{ id: string; value: number | null }>,
): Map<string, number | null> {
  const ranked = items
    .filter((i): i is { id: string; value: number } => i.value !== null)
    .sort((a, b) => b.value - a.value);
  const out = new Map<string, number | null>();
  for (const i of items) out.set(i.id, null);
  let previous: number | null = null;
  let previousRank = 0;
  ranked.forEach((item, index) => {
    const rank =
      previous !== null && item.value === previous ? previousRank : index + 1;
    out.set(item.id, rank);
    previous = item.value;
    previousRank = rank;
  });
  return out;
}

export interface Stats {
  moyenne: number;
  min: number;
  max: number;
}

/** Moyenne, minimum et maximum d'une liste de moyennes ; `null` si elle est vide. */
export function classStats(values: Array<number | null>): Stats | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return {
    moyenne: round2(present.reduce((a, b) => a + b, 0) / present.length),
    min: Math.min(...present),
    max: Math.max(...present),
  };
}

export interface Band {
  lettre: string;
  /** Moyenne sur 20 à partir de laquelle la lettre s'applique. */
  minimum: number;
}

/**
 * Lettre d'une moyenne : la tranche au plus grand minimum atteint. `null` si aucune tranche n'est définie ou si la
 * moyenne est sous la plus basse (aucune lettre inventée).
 */
export function letterFor(
  moyenne: number | null,
  bands: Band[],
): string | null {
  if (moyenne === null || bands.length === 0) return null;
  const reached = bands
    .filter((b) => moyenne >= b.minimum)
    .sort((a, b) => b.minimum - a.minimum);
  return reached[0]?.lettre ?? null;
}

/** Admis si la moyenne atteint la moyenne de passage ; `null` si l'un des deux manque (aucune mention inventée). */
export function passed(
  moyenne: number | null,
  moyennePassage: number | null,
): boolean | null {
  if (moyenne === null || moyennePassage === null) return null;
  return moyenne >= moyennePassage;
}

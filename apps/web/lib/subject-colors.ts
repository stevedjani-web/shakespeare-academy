// Couleurs des matières dans l'emploi du temps. Ce fichier ne dépend de rien (ni React, ni traductions) pour pouvoir
// être contrôlé par `scripts/check-subject-colors.mjs` et servir aussi à l'export Excel. La liste des noms de teintes
// est la même que celle du serveur (`apps/api/src/pedagogy/subject-colors.ts`), qui refuse tout autre nom.

export const SUBJECT_COLOR_KEYS = ["blue", "red", "green", "orange", "purple", "teal", "pink", "yellow", "indigo", "lime", "cyan", "gray"] as const;

export type SubjectColorKey = (typeof SUBJECT_COLOR_KEYS)[number];

export interface Swatch {
  /** Fond de la séance : une teinte très claire. */
  bg: string;
  /** Liseré et pastille : la même teinte, franche. */
  border: string;
  /** Texte : la même teinte, très foncée (contraste d'au moins 7 pour 1 sur le fond, voir le script de contrôle). */
  text: string;
}

export const SWATCHES: Record<SubjectColorKey, Swatch> = {
  blue: { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
  red: { bg: "#fee2e2", border: "#ef4444", text: "#7f1d1d" },
  green: { bg: "#dcfce7", border: "#22c55e", text: "#14532d" },
  orange: { bg: "#ffedd5", border: "#f97316", text: "#7c2d12" },
  purple: { bg: "#f3e8ff", border: "#a855f7", text: "#581c87" },
  teal: { bg: "#ccfbf1", border: "#14b8a6", text: "#134e4a" },
  pink: { bg: "#fce7f3", border: "#ec4899", text: "#831843" },
  yellow: { bg: "#fef9c3", border: "#eab308", text: "#713f12" },
  indigo: { bg: "#e0e7ff", border: "#6366f1", text: "#312e81" },
  lime: { bg: "#ecfccb", border: "#84cc16", text: "#365314" },
  cyan: { bg: "#cffafe", border: "#06b6d4", text: "#164e63" },
  gray: { bg: "#f1f5f9", border: "#64748b", text: "#0f172a" },
};

/** Teintes données automatiquement à une matière sans couleur choisie (le gris est réservé au choix volontaire). */
const AUTO_POOL = SUBJECT_COLOR_KEYS.filter((k) => k !== "gray");

export function isSubjectColor(value: unknown): value is SubjectColorKey {
  return typeof value === "string" && (SUBJECT_COLOR_KEYS as readonly string[]).includes(value);
}

function hash(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Teinte d'une matière : celle choisie par l'école, sinon une teinte automatique tirée de son code. La même matière a
 * donc toujours la même couleur, d'un écran à l'autre et d'une visite à l'autre, sans rien avoir à régler.
 */
export function resolveSubjectColor(couleur: string | null | undefined, code: string | null | undefined): SubjectColorKey {
  if (isSubjectColor(couleur)) return couleur;
  return AUTO_POOL[hash(code ?? "") % AUTO_POOL.length];
}

export function subjectSwatch(couleur: string | null | undefined, code: string | null | undefined): Swatch {
  return SWATCHES[resolveSubjectColor(couleur, code)];
}

/** Style d'une séance : fond clair, liseré de la teinte à gauche, texte foncé. */
export function subjectCellStyle(couleur: string | null | undefined, code: string | null | undefined): { backgroundColor: string; borderLeft: string; color: string } {
  const s = subjectSwatch(couleur, code);
  return { backgroundColor: s.bg, borderLeft: `4px solid ${s.border}`, color: s.text };
}

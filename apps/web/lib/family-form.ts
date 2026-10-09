// Aides du formulaire public des familles (D184) : cadrage de la photo, date de naissance en trois listes, force du mot
// de passe et brouillon. Fonctions pures (ni React ni traductions) pour être contrôlées par
// `scripts/check-family-collection.mjs`.

// ------------------------------------------------------------------------------------------------ Photo d'identité

/** Portrait 3:4, comme la carte d'élève. Le serveur impose le même cadrage : le navigateur n'envoie que le résultat. */
export const PHOTO_OUT_WIDTH = 450;
export const PHOTO_OUT_HEIGHT = 600;
export const PHOTO_FRAME_RATIO = PHOTO_OUT_WIDTH / PHOTO_OUT_HEIGHT;
/** Photo d'origine acceptée avant recadrage (un appareil récent dépasse 5 Mo) ; l'envoi, lui, pèse quelques dizaines de Ko. */
export const PHOTO_MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export interface CropInput {
  /** Taille de l'image d'origine. */
  width: number;
  height: number;
  /** Taille du cadre affiché à l'écran. */
  frameWidth: number;
  frameHeight: number;
  /** 1 = l'image couvre juste le cadre ; au-delà, on zoome. */
  zoom: number;
  /** Décalage du centre de l'image par rapport au centre du cadre, en pixels d'écran (positif = vers la droite / le bas). */
  x: number;
  y: number;
}

/** Échelle (pixels d'écran par pixel d'image) pour que l'image couvre exactement le cadre, sans bande vide. */
export function coverScale(c: Pick<CropInput, "width" | "height" | "frameWidth" | "frameHeight">): number {
  return Math.max(c.frameWidth / c.width, c.frameHeight / c.height);
}

/** Garde le zoom dans les bornes, et le décalage tel que l'image couvre toujours tout le cadre. */
export function clampCrop(c: CropInput): { zoom: number; x: number; y: number } {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom));
  const scale = coverScale(c) * zoom;
  const maxX = Math.max(0, (c.width * scale - c.frameWidth) / 2);
  const maxY = Math.max(0, (c.height * scale - c.frameHeight) / 2);
  return { zoom, x: Math.min(maxX, Math.max(-maxX, c.x)), y: Math.min(maxY, Math.max(-maxY, c.y)) };
}

/** Zone de l'image d'origine que montre le cadre : c'est ce qu'on dessine dans la photo envoyée. */
export function cropRect(input: CropInput): { sx: number; sy: number; sw: number; sh: number } {
  const { zoom, x, y } = clampCrop(input);
  const scale = coverScale(input) * zoom;
  const sw = input.frameWidth / scale;
  const sh = input.frameHeight / scale;
  return { sx: input.width / 2 - x / scale - sw / 2, sy: input.height / 2 - y / scale - sh / 2, sw, sh };
}

/** « image/jpeg » ou toute image : le navigateur décide ensuite s'il sait la lire (un HEIC sur un ordinateur, par exemple, non). */
export function looksLikeImage(file: { type: string; name: string }): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

// -------------------------------------------------------------------------------------------- Date de naissance

export const MIN_BIRTH_YEAR = 1990;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** « AAAA-MM-JJ » si les trois parties forment une vraie date, sinon chaîne vide. */
export function isoFromParts(year: string, month: string, day: string): string {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!year || !month || !day || !Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return "";
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function partsFromIso(iso: string): { year: string; month: string; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) } : { year: "", month: "", day: "" };
}

/** Années proposées, de la plus récente à la plus ancienne (l'enfant le plus jeune d'abord : c'est le cas courant). */
export function birthYears(todayIso: string): string[] {
  const last = Number(todayIso.slice(0, 4));
  const years: string[] = [];
  for (let y = last; y >= MIN_BIRTH_YEAR; y--) years.push(String(y));
  return years;
}

// -------------------------------------------------------------------------------------------------- Mot de passe

export type PasswordLevel = 0 | 1 | 2 | 3 | 4;

const COMMON = ["12345678", "123456789", "1234567890", "password", "motdepasse", "azertyui", "azerty123", "qwertyui", "00000000", "11111111"];

/** 0 = vide, 1 = faible, 2 = moyen, 3 = bon, 4 = excellent. Une aide visuelle, jamais une règle : 8 caractères restent le seul minimum. */
export function passwordStrength(password: string): PasswordLevel {
  if (!password) return 0;
  const lower = password.toLowerCase();
  if (COMMON.some((c) => lower.includes(c)) || /^(.)\1+$/.test(password)) return 1;
  let points = 0;
  if (password.length >= 8) points++;
  if (password.length >= 12) points++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes >= 2) points++;
  if (classes >= 3) points++;
  if (password.length < 8) return 1;
  return Math.max(1, Math.min(4, points)) as PasswordLevel;
}

// ---------------------------------------------------------------------------------------------------- Brouillon

export interface DraftParent {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  profession: string;
  adresse: string;
  lien: string;
}

export interface DraftChild {
  nom: string;
  prenom: string;
  dateNaissance: string;
  lieuNaissance: string;
  classId: string;
}

export interface Draft {
  parent: DraftParent;
  children: DraftChild[];
  step: number;
}

export const draftKey = (token: string) => `sa.famille.${token}`;

/** Ce qui se garde sur l'appareil : jamais le mot de passe, jamais les photos. */
export function serializeDraft(draft: Draft): string {
  return JSON.stringify(draft);
}

const str = (v: unknown): string => (typeof v === "string" ? v.slice(0, 200) : "");

/** Relit un brouillon sans rien présumer : une valeur inattendue est ignorée, un brouillon vide ou corrompu donne null. */
export function parseDraft(text: string | null | undefined, maxChildren: number): Draft | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as { parent?: Record<string, unknown>; children?: unknown; step?: unknown };
    const p = raw.parent ?? {};
    const parent: DraftParent = {
      nom: str(p.nom),
      prenom: str(p.prenom),
      telephone: str(p.telephone),
      email: str(p.email),
      profession: str(p.profession),
      adresse: str(p.adresse),
      lien: str(p.lien),
    };
    const children: DraftChild[] = (Array.isArray(raw.children) ? raw.children : []).slice(0, maxChildren).map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { nom: str(o.nom), prenom: str(o.prenom), dateNaissance: str(o.dateNaissance), lieuNaissance: str(o.lieuNaissance), classId: str(o.classId) };
    });
    const step = raw.step === 1 || raw.step === 2 ? raw.step : 0;
    const empty = Object.values(parent).every((v) => v === "") && children.every((c) => Object.values(c).every((v) => v === ""));
    return empty ? null : { parent, children: children.length > 0 ? children : [{ nom: "", prenom: "", dateNaissance: "", lieuNaissance: "", classId: "" }], step };
  } catch {
    return null;
  }
}

// Lot 16 : cahier de textes et devoirs. Types des réponses de l'API et petites fonctions d'affichage.
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/store";

export interface TextbookContext {
  annee: { id: string; libelle: string; dateDebut: string; dateFin: string } | null;
  classes: Array<{ id: string; nom: string }>;
  affectations: Array<{ classId: string; className: string; subjectId: string; subjectName: string }>;
  peutEcrire: boolean;
  aujourdhui: string;
}

export interface TextbookRow {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherName: string;
  date: string;
  contenu: string | null;
  devoirs: string | null;
  dateEcheance: string | null;
  modifiable: boolean;
}

export interface ParentTextbookEntry {
  id: string;
  date: string;
  matiere: string;
  enseignant: string;
  contenu: string | null;
  devoirs: string | null;
  dateEcheance: string | null;
}

export interface ParentTextbook {
  classe: string | null;
  aujourdhui?: string;
  aVenir: ParentTextbookEntry[];
  entrees: ParentTextbookEntry[];
}

/** 2000 caractères au plus par texte (le serveur refuse au-delà). */
export const TEXTBOOK_MAX_LENGTH = 2000;

/** « lundi 21/09/2026 » (ou « Monday 21/09/2026 ») à partir de « 2026-09-21 », dans la langue courante. */
export function frDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  const day = new Date(`${iso}T00:00:00Z`).toLocaleDateString(INTL_LOCALE[getLocale()], { weekday: "long", timeZone: "UTC" });
  return `${day} ${d}/${m}/${y}`;
}

/** « 21/09/2026 » à partir de « 2026-09-21 ». */
export function frShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

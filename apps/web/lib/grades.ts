// Lot 15 : notes, évaluations et bulletins. Types des réponses de l'API et petites fonctions d'affichage.
import { translate, type MessageKey } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/store";

export interface GradeTerm {
  id: string;
  libelle: string;
  ordre: number;
  dateDebut: string;
  dateFin: string;
}

export interface GradeAssignment {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherName: string;
}

export interface GradeContext {
  annee: { id: string; libelle: string } | null;
  trimestres: GradeTerm[];
  classes: Array<{ id: string; nom: string; levelId: string }>;
  affectations: GradeAssignment[];
  parametres: { baremeDefaut: number; moyennePassage: number | null; bulletinAfficheRang: boolean };
}

export type PeriodStatus = "OUVERT" | "VALIDE" | "PUBLIE";

export interface EvaluationRow {
  id: string;
  termId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  titre: string;
  date: string;
  bareme: number;
  coefficient: number;
  notes: number;
  absents: number;
  dispenses: number;
  effectif: number;
  periode: PeriodStatus;
}

export type NoteStatus = "NOTE" | "ABSENT" | "DISPENSE";

export interface SheetRow {
  studentId: string;
  matricule: string;
  nom: string;
  prenom: string;
  statut: NoteStatus | null;
  valeur: number | null;
}

export interface GradeSheet {
  evaluation: {
    id: string;
    termId: string;
    trimestre: string;
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
    titre: string;
    date: string;
    bareme: number;
    coefficient: number;
  };
  periode: PeriodStatus;
  verrouille: boolean;
  eleves: SheetRow[];
}

export interface Stats {
  moyenne: number;
  min: number;
  max: number;
}

export interface ClassResults {
  classe: { id: string; nom: string; affichageLettres: boolean };
  periode: PeriodStatus;
  matieres: Array<{ subjectId: string; nom: string; coefficient: number; evaluations: number; stats: Stats | null }>;
  eleves: Array<{
    studentId: string;
    matricule: string;
    nom: string;
    prenom: string;
    moyennes: Record<string, number | null>;
    moyenneGenerale?: number | null;
    rang?: number | null;
  }>;
  statsGenerale?: Stats | null;
  complet: boolean;
}

export interface PeriodInfo {
  termId: string;
  classId: string;
  trimestre: string;
  classe: string;
  statut: PeriodStatus;
  valideAt: string | null;
  publieAt: string | null;
  rouvertAt: string | null;
  rouvertMotif: string | null;
  evaluations: number;
  evaluationsSansNote: number;
  matieresSansEvaluation: string[];
  bulletins: number;
  correctionsDepuisValidation: number;
}

export interface BulletinListItem {
  id: string;
  studentId: string;
  matricule: string;
  nom: string;
  prenom: string;
  moyenneGenerale: number | null;
  rang: number | null;
  effectif: number;
  appreciationGenerale: string | null;
}

export interface BulletinData {
  id: string;
  statut: PeriodStatus;
  ecole: { nom: string; adresse: string | null; telephone: string | null; logoUrl: string | null };
  // Facultative depuis le 22 septembre 2026 (Student.dateNaissance) : le bulletin s'imprime quand même.
  eleve: { nom: string; prenom: string; matricule: string; dateNaissance: string | null };
  classe: { nom: string; niveau: string; section: string };
  trimestre: { libelle: string; dateDebut: string; dateFin: string };
  annee: string;
  moyenneGenerale: number | null;
  lettre: string | null;
  admis: boolean | null;
  appreciationGenerale: string | null;
  affichageLettres: boolean;
  matieres: Array<{
    nom: string;
    coefficient: number;
    moyenne: number | null;
    lettre: string | null;
    appreciation: string | null;
    moyenneClasse?: number | null;
    min?: number | null;
    max?: number | null;
  }>;
  rang?: number | null;
  effectif?: number;
  moyenneClasse?: number | null;
  publieAt: string | null;
}

export interface GradeSettings {
  baremeDefaut: number;
  moyennePassage: number | null;
  bulletinAfficheRang: boolean;
  bands: Array<{ lettre: string; minimum: number }>;
  sections: Array<{ id: string; nom: string; affichageLettres: boolean }>;
}

const PERIOD_KEY: Record<PeriodStatus, MessageKey> = {
  OUVERT: "acd.period.OUVERT",
  VALIDE: "acd.period.VALIDE",
  PUBLIE: "acd.period.PUBLIE",
};

/** Libellé d'un état de trimestre dans la langue courante. */
export function periodLabel(status: PeriodStatus): string {
  return translate(PERIOD_KEY[status]);
}

/** Même table qu'avant, mais lue au moment de l'accès : la langue courante s'applique (les getters ne sont pas évalués au chargement). */
export const PERIOD_LABEL: Record<PeriodStatus, string> = {
  get OUVERT() {
    return periodLabel("OUVERT");
  },
  get VALIDE() {
    return periodLabel("VALIDE");
  },
  get PUBLIE() {
    return periodLabel("PUBLIE");
  },
};

/** « 13,11 » en français (virgule décimale), « 13.11 » en anglais ; « - » quand il n'y a pas de moyenne (jamais 0). */
export function formatNote(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const text = value.toFixed(2);
  return getLocale() === "fr" ? text.replace(".", ",") : text;
}

/** Une note saisie « 12,5 » ou « 12.5 » ; `null` si le texte n'est pas un nombre. */
export function parseNote(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (normalized === "") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** « 1er », « 2e » en français ; « 1st », « 2nd », « 3rd », « 4th » en anglais. */
function ordinal(n: number): string {
  if (getLocale() === "fr") return `${n}${n === 1 ? "er" : "e"}`;
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export function rankLabel(rang: number | null | undefined, effectif?: number): string {
  if (rang === null || rang === undefined) return "-";
  return effectif ? translate("bulletin.rankOf", { rank: ordinal(rang), total: effectif }) : ordinal(rang);
}

// Dossier élève, vue 360° (GET /students/:id/bulletins, GRADE_READ) : tous les bulletins de l'élève,
// quel que soit leur statut — un VALIDE (pas encore publié) reste visible au personnel, jamais aux parents.
export interface StudentBulletinRow {
  id: string;
  trimestre: string;
  classe: string;
  annee: string;
  statut: PeriodStatus;
  moyenneGenerale: number | null;
  rang: number | null;
  effectif: number;
  publieAt: string | null;
}

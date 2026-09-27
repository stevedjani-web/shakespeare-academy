// Formulaire public de préinscription : état d'une fiche enfant, contrôle des champs et couleurs des fiches.
// Ce fichier ne dépend de rien (ni React, ni traductions) pour pouvoir être contrôlé par
// `scripts/check-pre-registration-form.mjs`.
import { SWATCHES, type Swatch, type SubjectColorKey } from "./subject-colors.ts";

export interface ParentForm {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
}

export interface ChildForm {
  /** Identifiant local de la fiche (jamais envoyé) : garde chaque fiche stable quand on en retire une. */
  key: string;
  nom: string;
  prenom: string;
  sexe: "M" | "F" | "";
  dateNaissance: string;
  lieuNaissance: string;
  levelId: string;
  /** Vide tant que le parent n'a pas choisi : le choix est obligatoire pour chaque enfant. */
  typeEleve: "NOUVEAU" | "ANCIEN" | "";
  ancienEtablissement: string;
  classePrecedenteLevelId: string;
  bulletin: File | null;
  bulletinError: string | null;
}

export type ChildField = "nom" | "prenom" | "sexe" | "dateNaissance" | "levelId" | "typeEleve" | "classePrecedenteLevelId";

/** Une teinte par enfant, dans cet ordre : la fiche, la pastille et le récapitulatif d'un enfant gardent la sienne. */
const CHILD_COLORS: SubjectColorKey[] = ["blue", "orange", "green", "purple", "teal", "pink", "yellow", "indigo"];

export function childSwatch(index: number): Swatch {
  return SWATCHES[CHILD_COLORS[index % CHILD_COLORS.length]];
}

/**
 * Champs obligatoires encore vides ou invalides d'une fiche enfant (liste vide = fiche complète). L'ancien
 * établissement et le bulletin sont facultatifs ; la classe de l'année précédente n'est demandée que pour un ancien élève.
 */
export function childMissing(c: ChildForm, today: string): ChildField[] {
  const missing: ChildField[] = [];
  if (!c.nom.trim()) missing.push("nom");
  if (!c.prenom.trim()) missing.push("prenom");
  if (!c.sexe) missing.push("sexe");
  if (!c.dateNaissance || c.dateNaissance > today) missing.push("dateNaissance");
  if (!c.levelId) missing.push("levelId");
  if (!c.typeEleve) missing.push("typeEleve");
  if (c.typeEleve === "ANCIEN" && !c.classePrecedenteLevelId) missing.push("classePrecedenteLevelId");
  return missing;
}

/** Initiales d'une fiche (deux lettres au plus), ou le rang de l'enfant tant que le nom n'est pas saisi. */
export function childInitials(c: Pick<ChildForm, "nom" | "prenom">, index: number): string {
  const letters = `${c.prenom.trim().charAt(0)}${c.nom.trim().charAt(0)}`.toUpperCase();
  return letters || String(index + 1);
}

// Collecte des informations des familles par lien de classe (D184 à D190) : formulaire du parent et messages du groupe.
// Fonctions pures (ni React ni traductions) pour être contrôlées par `scripts/check-family-collection.mjs`.

export const FAMILY_LINKS = ["Père", "Mère", "Tuteur légal", "Autre"] as const;
export type FamilyLink = (typeof FAMILY_LINKS)[number];

export const MAX_FAMILY_CHILDREN = 8;
const MIN_BIRTH_DATE = "1990-01-01";

export interface FamilyParentForm {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  profession: string;
  adresse: string;
  lien: FamilyLink | "";
}

export interface FamilyChildForm {
  /** Identifiant local de la fiche (jamais envoyé). */
  key: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  lieuNaissance: string;
  classId: string;
}

export type FamilyParentField = "nom" | "prenom" | "telephone" | "email" | "lien";
export type FamilyChildField = "nom" | "prenom" | "dateNaissance";

export const EMPTY_PARENT: FamilyParentForm = { nom: "", prenom: "", telephone: "", email: "", profession: "", adresse: "", lien: "" };

/** Chiffres seuls : un numéro de téléphone a au moins huit chiffres, quelle que soit la façon dont il est écrit. */
export function phoneIsPlausible(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 8;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Champs obligatoires du parent encore vides ou invalides (liste vide = étape complète). L'e-mail est facultatif mais doit être valide. */
export function parentMissing(p: FamilyParentForm): FamilyParentField[] {
  const missing: FamilyParentField[] = [];
  if (!p.nom.trim()) missing.push("nom");
  if (!p.prenom.trim()) missing.push("prenom");
  if (!phoneIsPlausible(p.telephone)) missing.push("telephone");
  if (p.email.trim() && !EMAIL.test(p.email.trim())) missing.push("email");
  if (!p.lien) missing.push("lien");
  return missing;
}

/** Champs obligatoires d'une fiche enfant encore vides ou invalides. */
export function childMissing(c: FamilyChildForm, today: string): FamilyChildField[] {
  const missing: FamilyChildField[] = [];
  if (!c.nom.trim()) missing.push("nom");
  if (!c.prenom.trim()) missing.push("prenom");
  if (!c.dateNaissance || c.dateNaissance > today || c.dateNaissance < MIN_BIRTH_DATE) missing.push("dateNaissance");
  return missing;
}

export type PasswordIssue = "short" | "mismatch" | null;

export function passwordIssue(password: string, confirmation: string): PasswordIssue {
  if (password.length < 8) return "short";
  if (confirmation !== password) return "mismatch";
  return null;
}

/** Corps envoyé à l'API : une valeur facultative vide est omise (jamais une chaîne vide). */
export function buildSubmission(
  parent: FamilyParentForm,
  children: FamilyChildForm[],
  defaultClassId: string,
  password: string,
  policyVersion: string,
) {
  const opt = (v: string) => v.trim() || undefined;
  return {
    responsable: {
      nom: parent.nom.trim(),
      prenom: parent.prenom.trim(),
      telephone: parent.telephone.trim(),
      email: opt(parent.email),
      profession: opt(parent.profession),
      adresse: opt(parent.adresse),
      lien: parent.lien || undefined,
    },
    motDePasse: password,
    consentement: true,
    versionPolitique: policyVersion,
    enfants: children.map((c) => ({
      nom: c.nom.trim(),
      prenom: c.prenom.trim(),
      dateNaissance: c.dateNaissance,
      lieuNaissance: opt(c.lieuNaissance),
      classId: c.classId && c.classId !== defaultClassId ? c.classId : undefined,
    })),
  };
}

/** Message à coller dans le groupe WhatsApp de la classe : toujours bilingue, une seule fois par classe. */
export function collectMessage(args: { ecole: string; classe: string; url: string }): string {
  const { ecole, classe, url } = args;
  return [
    `Chers parents de ${classe}, pour mettre à jour le dossier de votre enfant à ${ecole}, merci de remplir ce formulaire (2 minutes, depuis votre téléphone) :`,
    url,
    "",
    `Dear parents of ${classe}, to update your child's file at ${ecole}, please fill in this short form (2 minutes, from your phone):`,
    url,
  ].join("\n");
}

/** Message « profils activés », à coller dans le même groupe une fois les demandes validées. */
export function activatedMessage(args: { ecole: string; classe: string; url: string }): string {
  const { ecole, classe, url } = args;
  return [
    `Chers parents de ${classe}, les dossiers reçus ont été validés. Vous pouvez maintenant vous connecter à l'espace parents de ${ecole} avec votre numéro de téléphone et le mot de passe que vous avez choisi :`,
    url,
    "",
    `Dear parents of ${classe}, the files we received have been approved. You can now sign in to the ${ecole} parents' space with your phone number and the password you chose:`,
    url,
  ].join("\n");
}

/** Adresse du formulaire d'une classe. */
export function collectUrl(origin: string, token: string): string {
  return `${origin}/famille/${token}`;
}

/** Adresse de connexion de l'espace parents. */
export function parentLoginUrl(origin: string): string {
  return `${origin}/parents/connexion`;
}

// ---------------------------------------------------------------------------------------- Écran du secrétariat

export interface CollectLinkView {
  token: string;
  actif: boolean;
  expireLe: string;
  expire: boolean;
}

export interface ClassProgress {
  classId: string;
  classe: string;
  section: string;
  effectif: number;
  complets: number;
  sansDate: number;
  sansResponsable: number;
  comptesActifs: number;
  enAttente: number;
  lien: CollectLinkView | null;
}

export interface ClassRosterStudent {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  dateNaissance: boolean;
  responsable: boolean;
  compte: "ACTIF" | null;
}

export interface ClassDetail {
  classe: { id: string; nom: string };
  lien: CollectLinkView | null;
  eleves: ClassRosterStudent[];
}

export interface FamilyAlert {
  code: string;
  severite: "info" | "conflit";
  detail?: Record<string, unknown>;
}

export interface FamilyChange {
  cible: "ELEVE" | "RESPONSABLE" | "LIEN" | "COMPTE";
  champ: string;
  avant: string | null;
  apres: string | null;
  type: "ajout" | "remplacement";
}

export type FamilyMatch = "EXACT" | "PROBABLE" | "PLUSIEURS" | "AUCUN" | "CHOISI";

export interface FamilyAnalysis {
  match: FamilyMatch;
  etudiantPropose: { id: string; nom: string; prenom: string; matricule: string } | null;
  candidats: Array<{ id: string; nom: string; prenom: string; matricule: string }>;
  alertes: FamilyAlert[];
  modifications: FamilyChange[];
  simple: boolean;
}

export interface FamilyChildView {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  classe: { id: string; nom: string };
  statut: "EN_ATTENTE" | "VALIDE" | "REFUSE";
  motifRefus: string | null;
  traiteLe: string | null;
  eleve: { id: string; nom: string; prenom: string; matricule: string } | null;
  analyse: FamilyAnalysis | null;
}

export interface FamilySubmissionView {
  id: string;
  creeLe: string;
  responsable: {
    nom: string;
    prenom: string;
    telephone: string;
    email: string | null;
    profession: string | null;
    adresse: string | null;
    lien: string | null;
  };
  enfants: FamilyChildView[];
}

/** Un conflit demande un regard : valeur différente de celle du dossier, ou élève qui a déjà un autre responsable. */
export function hasConflict(analysis: FamilyAnalysis | null | undefined): boolean {
  return !!analysis?.alertes.some((a) => a.severite === "conflit");
}

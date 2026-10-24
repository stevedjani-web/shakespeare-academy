// Collecte des informations des enseignants : types renvoyés par l'API et règles du formulaire (fonctions pures).

export interface TeacherFormState {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  urgenceNom: string;
  urgenceTelephone: string;
  matieres: string[];
  motDePasse: string;
  confirmation: string;
  consentement: boolean;
}

export const EMPTY_TEACHER_FORM: TeacherFormState = {
  nom: "",
  prenom: "",
  telephone: "",
  email: "",
  urgenceNom: "",
  urgenceTelephone: "",
  matieres: [],
  motDePasse: "",
  confirmation: "",
  consentement: false,
};

export type TeacherField = "nom" | "prenom" | "telephone" | "email" | "urgenceTelephone" | "motDePasse" | "confirmation" | "consentement";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Au moins 8 chiffres : c'est l'identifiant de connexion. */
export function phoneIsPlausible(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 8;
}

/** Champs obligatoires encore vides ou invalides (liste vide = formulaire prêt à partir). */
export function teacherMissing(f: TeacherFormState): TeacherField[] {
  const missing: TeacherField[] = [];
  if (!f.nom.trim()) missing.push("nom");
  if (!f.prenom.trim()) missing.push("prenom");
  if (!phoneIsPlausible(f.telephone)) missing.push("telephone");
  if (f.email.trim() && !EMAIL.test(f.email.trim())) missing.push("email");
  if (f.urgenceTelephone.trim() && !phoneIsPlausible(f.urgenceTelephone)) missing.push("urgenceTelephone");
  if (f.motDePasse.length < 8) missing.push("motDePasse");
  else if (f.confirmation !== f.motDePasse) missing.push("confirmation");
  if (!f.consentement) missing.push("consentement");
  return missing;
}

/** Corps de l'envoi : le JSON dans « payload », la photo (déjà recadrée) dans « photo ». Un champ vide est omis. */
export function buildTeacherFormData(f: TeacherFormState, version: string, photo: Blob | null): FormData {
  const clean = (v: string) => (v.trim() ? v.trim() : undefined);
  const payload = {
    nom: f.nom.trim(),
    prenom: f.prenom.trim(),
    telephone: f.telephone.trim(),
    email: clean(f.email),
    urgenceNom: clean(f.urgenceNom),
    urgenceTelephone: clean(f.urgenceTelephone),
    matieres: f.matieres,
    motDePasse: f.motDePasse,
    consentement: f.consentement,
    versionPolitique: version,
  };
  const body = new FormData();
  body.append("payload", JSON.stringify(payload));
  if (photo) body.append("photo", photo, "photo.jpg");
  return body;
}

// ------------------------------------------------------------------------------------------ personnel

export interface TeacherLinkView {
  token: string;
  actif: boolean;
  expiresAt: string;
  expire: boolean;
}

export interface TeacherSubmissionView {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string | null;
  urgenceNom: string | null;
  urgenceTelephone: string | null;
  photo: boolean;
  matieres: Array<{ id: string; nom: string }>;
  statut: "EN_ATTENTE" | "VALIDEE" | "REFUSEE";
  motifRefus: string | null;
  teacherId: string | null;
  createdAt: string;
  traiteLe: string | null;
}

export type TeacherMatch = "EXACT" | "PROBABLE" | "ORTHOGRAPHE";

export interface TeacherCandidate {
  id: string;
  nom: string;
  prenom: string;
  statut: string;
  telephone: string | null;
  email: string | null;
  aCompte: boolean;
  aPhoto: boolean;
  modePointage: "SEANCE" | "JOURNEE";
  correspondance: TeacherMatch;
}

export interface TeacherAlert {
  code: string;
  gravite: "BLOQUANT" | "CONFIRMATION" | "INFO";
  message: string;
}

export interface TeacherAnalysis {
  demande: TeacherSubmissionView;
  candidats: TeacherCandidate[];
  propose: string | null;
  alertes: TeacherAlert[];
}

export interface TeacherStatusRow {
  id: string;
  nom: string;
  prenom: string;
  statut: string;
  aTelephone: boolean;
  aCompte: boolean;
  aPhoto: boolean;
  demandeEnAttente: boolean;
}

/** Adresse de la page publique d'un lien, à partir de l'adresse du site ouverte dans le navigateur. */
export function teacherFormUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/enseignants/${token}`;
}

export function teacherLoginUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/login`;
}

/** Message à coller dans le groupe WhatsApp du personnel : français puis anglais (le groupe est mixte). */
export function teacherShareMessage(url: string, school: string): string {
  return [
    `Bonjour à tous les enseignants de ${school} 👋`,
    "Pour finaliser votre dossier et créer votre compte sur la plateforme de l'école, remplissez vos informations ici (2 minutes) :",
    url,
    "Vous choisissez vous-même votre mot de passe. Le secrétariat vérifie, puis vous pourrez vous connecter avec votre numéro de téléphone.",
    "",
    `Hello to all ${school} teachers 👋`,
    "To complete your file and create your account on the school platform, fill in your details here (2 minutes):",
    url,
    "You choose your own password. The school office checks, then you can sign in with your phone number.",
  ].join("\n");
}

/** Une alerte bloque la validation ; une alerte « à confirmer » demande une case cochée. */
export function blockingAlert(alerts: TeacherAlert[]): TeacherAlert | undefined {
  return alerts.find((a) => a.gravite === "BLOQUANT");
}

export function confirmationAlerts(alerts: TeacherAlert[]): TeacherAlert[] {
  return alerts.filter((a) => a.gravite === "CONFIRMATION");
}

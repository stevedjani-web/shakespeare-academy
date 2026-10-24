// Collecte des informations des enseignants : types renvoyés par l'API et règles du formulaire guidé (fonctions pures).

/** Une classe de l'année active telle que la page publique la propose (jamais d'effectif ni de nom d'élève). */
export interface TeacherClassOption {
  id: string;
  nom: string;
  niveau: string;
  cycle: string;
  section: string;
  // Collège ou lycée : l'enseignant y intervient par matière, on lui demande donc ses matières (décidé par le serveur).
  secondaire: boolean;
}

export interface TeacherFormState {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  urgenceNom: string;
  urgenceTelephone: string;
  classes: string[];
  matieres: string[];
  // Matières absentes de la liste, tapées à la main (collège et lycée).
  autresMatieres: string[];
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
  classes: [],
  matieres: [],
  autresMatieres: [],
  motDePasse: "",
  confirmation: "",
  consentement: false,
};

export type TeacherField =
  | "nom"
  | "prenom"
  | "photo"
  | "telephone"
  | "email"
  | "urgenceTelephone"
  | "classes"
  | "matieres"
  | "motDePasse"
  | "confirmation"
  | "consentement";

/** Les écrans du parcours, dans l'ordre. « welcome » n'est pas une étape numérotée. */
export type TeacherStep = "welcome" | "identity" | "photo" | "contact" | "classes" | "subjects" | "password" | "review";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Au moins 8 chiffres : c'est l'identifiant de connexion. */
export function phoneIsPlausible(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 8;
}

/** Vrai si l'une des classes cochées est du collège ou du lycée : on demande alors les matières. */
export function needsSubjects(options: TeacherClassOption[], selected: string[]): boolean {
  const chosen = new Set(selected);
  return options.some((c) => chosen.has(c.id) && c.secondaire);
}

/** Étapes numérotées du parcours : l'écran des matières n'existe que pour le collège et le lycée. */
export function teacherSteps(withSubjects: boolean): Exclude<TeacherStep, "welcome">[] {
  return withSubjects ? ["identity", "photo", "contact", "classes", "subjects", "password", "review"] : ["identity", "photo", "contact", "classes", "password", "review"];
}

/** « Étape 3 sur 6 » : rang de l'étape (à partir de 1) et nombre d'étapes ; l'accueil est à 0. */
export function stepProgress(step: TeacherStep, withSubjects: boolean): { index: number; total: number } {
  const steps = teacherSteps(withSubjects);
  const i = steps.indexOf(step as Exclude<TeacherStep, "welcome">);
  return { index: i + 1, total: steps.length };
}

/** Étape qui suit (ou précède) celle-ci, en sautant l'écran des matières quand il ne sert pas. */
export function neighbourStep(step: TeacherStep, withSubjects: boolean, direction: 1 | -1): TeacherStep {
  const all: TeacherStep[] = ["welcome", ...teacherSteps(withSubjects)];
  const i = all.indexOf(step);
  if (i < 0) return "welcome";
  return all[Math.max(0, Math.min(all.length - 1, i + direction))];
}

/** Champs qui relèvent de chaque écran : sert à n'afficher que les erreurs de l'écran courant. */
export function stepFields(step: TeacherStep): TeacherField[] {
  switch (step) {
    case "identity":
      return ["nom", "prenom"];
    case "photo":
      return ["photo"];
    case "contact":
      return ["telephone", "email", "urgenceTelephone"];
    case "classes":
      return ["classes"];
    case "subjects":
      return ["matieres"];
    case "password":
      return ["motDePasse", "confirmation"];
    case "review":
      return ["consentement"];
    default:
      return [];
  }
}

/** Champs obligatoires encore vides ou invalides (liste vide = formulaire prêt à partir). */
export function teacherMissing(f: TeacherFormState, hasPhoto: boolean, withSubjects: boolean): TeacherField[] {
  const missing: TeacherField[] = [];
  if (!f.nom.trim()) missing.push("nom");
  if (!f.prenom.trim()) missing.push("prenom");
  if (!hasPhoto) missing.push("photo");
  if (!phoneIsPlausible(f.telephone)) missing.push("telephone");
  if (f.email.trim() && !EMAIL.test(f.email.trim())) missing.push("email");
  if (f.urgenceTelephone.trim() && !phoneIsPlausible(f.urgenceTelephone)) missing.push("urgenceTelephone");
  if (f.classes.length === 0) missing.push("classes");
  if (withSubjects && f.matieres.length === 0 && f.autresMatieres.length === 0) missing.push("matieres");
  if (f.motDePasse.length < 8) missing.push("motDePasse");
  else if (f.confirmation !== f.motDePasse) missing.push("confirmation");
  if (!f.consentement) missing.push("consentement");
  return missing;
}

/** Ce qui manque sur UN écran. */
export function missingOnStep(step: TeacherStep, f: TeacherFormState, hasPhoto: boolean, withSubjects: boolean): TeacherField[] {
  const own = new Set(stepFields(step));
  return teacherMissing(f, hasPhoto, withSubjects).filter((field) => own.has(field));
}

/** Premier écran où quelque chose manque encore (pour renvoyer l'enseignant au bon endroit à l'envoi). */
export function firstStepWithMissing(f: TeacherFormState, hasPhoto: boolean, withSubjects: boolean): TeacherStep | null {
  for (const step of teacherSteps(withSubjects)) {
    if (missingOnStep(step, f, hasPhoto, withSubjects).length > 0) return step;
  }
  return null;
}

export interface ClassGroup {
  section: string;
  cycles: Array<{ cycle: string; secondaire: boolean; classes: TeacherClassOption[] }>;
}

/** Classes regroupées par section puis par cycle, dans l'ordre reçu du serveur (Primaire avant Collège). */
export function groupClasses(options: TeacherClassOption[]): ClassGroup[] {
  const groups: ClassGroup[] = [];
  for (const c of options) {
    let group = groups.find((g) => g.section === c.section);
    if (!group) {
      group = { section: c.section, cycles: [] };
      groups.push(group);
    }
    let cycle = group.cycles.find((x) => x.cycle === c.cycle);
    if (!cycle) {
      cycle = { cycle: c.cycle, secondaire: c.secondaire, classes: [] };
      group.cycles.push(cycle);
    }
    cycle.classes.push(c);
  }
  return groups;
}

/** Noms des classes cochées, dans l'ordre de la structure scolaire. */
export function selectedClassNames(options: TeacherClassOption[], selected: string[]): string[] {
  const chosen = new Set(selected);
  return options.filter((c) => chosen.has(c.id)).map((c) => c.nom);
}

export const MAX_OTHER_SUBJECTS = 5;
export const MAX_OTHER_SUBJECT_LENGTH = 60;

/** Clé de comparaison d'un nom de matière : accents, casse et ponctuation ignorés (même règle que le serveur). */
export function subjectKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Ajoute une matière tapée à la main : espaces réduits, longueur bornée, jamais deux fois la même (accents et casse ignorés),
 * cinq au plus. Renvoie la liste inchangée si rien n'est à ajouter.
 */
export function addOtherSubject(list: string[], raw: string): string[] {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_OTHER_SUBJECT_LENGTH).trim();
  const key = subjectKey(name);
  if (!key || list.length >= MAX_OTHER_SUBJECTS) return list;
  if (list.some((x) => subjectKey(x) === key)) return list;
  return [...list, name];
}

/** Corps de l'envoi : le JSON dans « payload », la photo (déjà recadrée) dans « photo ». Un champ vide est omis. */
export function buildTeacherFormData(f: TeacherFormState, version: string, photo: Blob, withSubjects: boolean): FormData {
  const clean = (v: string) => (v.trim() ? v.trim() : undefined);
  const payload = {
    nom: f.nom.trim(),
    prenom: f.prenom.trim(),
    telephone: f.telephone.trim(),
    email: clean(f.email),
    urgenceNom: clean(f.urgenceNom),
    urgenceTelephone: clean(f.urgenceTelephone),
    classes: f.classes,
    // Maternelle et primaire : aucune matière (l'enseignant est titulaire de sa classe).
    matieres: withSubjects ? f.matieres : [],
    autresMatieres: withSubjects ? f.autresMatieres : [],
    motDePasse: f.motDePasse,
    consentement: f.consentement,
    versionPolitique: version,
  };
  const body = new FormData();
  body.append("payload", JSON.stringify(payload));
  body.append("photo", photo, "photo.jpg");
  return body;
}

// ------------------------------------------------------------------------------------------------ brouillon

/** Ce qui est gardé sur le téléphone si l'enseignant quitte la page : jamais le mot de passe, la photo ni l'accord donné. */
export interface TeacherDraft {
  step: TeacherStep;
  form: Omit<TeacherFormState, "motDePasse" | "confirmation" | "consentement">;
}

export function draftOf(step: TeacherStep, f: TeacherFormState): TeacherDraft {
  return {
    step,
    form: {
      nom: f.nom,
      prenom: f.prenom,
      telephone: f.telephone,
      email: f.email,
      urgenceNom: f.urgenceNom,
      urgenceTelephone: f.urgenceTelephone,
      classes: f.classes,
      matieres: f.matieres,
      autresMatieres: f.autresMatieres,
    },
  };
}

const STEPS: TeacherStep[] = ["welcome", "identity", "photo", "contact", "classes", "subjects", "password", "review"];

/**
 * Relit un brouillon : seulement des valeurs connues (une classe ou une matière disparue est retirée), jamais une étape qui
 * suppose une photo (elle n'est pas gardée : on revient à l'écran de la photo).
 */
export function restoreDraft(raw: unknown, classIds: string[], subjectIds: string[]): { step: TeacherStep; form: TeacherFormState } | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<TeacherDraft>;
  if (!d.form || typeof d.form !== "object" || typeof d.step !== "string" || !STEPS.includes(d.step as TeacherStep)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const list = (v: unknown, allowed: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && allowed.includes(x)) : []);
  const f = d.form as Record<string, unknown>;
  const otherList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").reduce<string[]>((acc, x) => addOtherSubject(acc, x), []) : []);
  const form: TeacherFormState = {
    ...EMPTY_TEACHER_FORM,
    nom: str(f.nom),
    prenom: str(f.prenom),
    telephone: str(f.telephone),
    email: str(f.email),
    urgenceNom: str(f.urgenceNom),
    urgenceTelephone: str(f.urgenceTelephone),
    classes: list(f.classes, classIds),
    matieres: list(f.matieres, subjectIds),
    autresMatieres: otherList(f.autresMatieres),
  };
  const order = STEPS.indexOf(d.step as TeacherStep);
  const photoIndex = STEPS.indexOf("photo");
  const step: TeacherStep = order > photoIndex ? "photo" : (d.step as TeacherStep);
  return { step, form };
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
  classes: TeacherClassOption[];
  matieres: Array<{ id: string; nom: string }>;
  autresMatieres: string[];
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
    "Pour finaliser votre dossier et créer votre compte sur la plateforme de l'école, ouvrez ce lien depuis votre téléphone (3 minutes) :",
    url,
    "Un assistant vous guide pas à pas. Préparez une photo de vous (obligatoire), votre numéro de téléphone et les classes où vous enseignez. Vous choisissez vous-même votre mot de passe. Le secrétariat vérifie, puis vous pourrez vous connecter avec votre numéro de téléphone.",
    "",
    `Hello to all ${school} teachers 👋`,
    "To complete your file and create your account on the school platform, open this link on your phone (3 minutes):",
    url,
    "An assistant guides you step by step. Have a photo of yourself ready (required), your phone number and the classes you teach. You choose your own password. The school office checks, then you can sign in with your phone number.",
  ].join("\n");
}

/** Une alerte bloque la validation ; une alerte « à confirmer » demande une case cochée. */
export function blockingAlert(alerts: TeacherAlert[]): TeacherAlert | undefined {
  return alerts.find((a) => a.gravite === "BLOQUANT");
}

export function confirmationAlerts(alerts: TeacherAlert[]): TeacherAlert[] {
  return alerts.filter((a) => a.gravite === "CONFIRMATION");
}

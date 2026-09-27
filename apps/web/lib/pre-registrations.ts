// Préinscription en ligne (Lot 21) : types renvoyés par l'API et libellés.
// Une demande porte un parent ou tuteur et un ou plusieurs enfants ; chaque enfant a sa classe demandée, son statut
// (nouvel élève ou ancien élève), ses documents et sa propre réponse du secrétariat.
import { translate } from "@/lib/i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/store";

export type PreRegistrationStatus = "EN_ATTENTE" | "ACCEPTEE" | "REJETEE";
/** Vue d'ensemble d'une demande : à traiter tant qu'un enfant attend une réponse. */
export type RequestOverview = "EN_ATTENTE" | "TRAITEE";
export type StudentKind = "NOUVEAU" | "ANCIEN";

/** Nombre maximal d'enfants dans une demande (le serveur applique la même limite). */
export const MAX_CHILDREN = 8;
/** Taille maximale d'un bulletin joint, en octets (le serveur applique la même limite). */
export const MAX_BULLETIN_BYTES = 5 * 1024 * 1024;
export const BULLETIN_ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

export interface LevelNode {
  id: string;
  nom: string;
}

export interface CycleNode {
  cycleId: string;
  cycleNom: string;
  levels: LevelNode[];
}

export interface SectionNode {
  sectionId: string;
  sectionNom: string;
  cycles: CycleNode[];
}

export interface PreRegistrationChildView {
  id: string;
  ordre: number;
  eleve: { nom: string; prenom: string; sexe: "M" | "F"; dateNaissance: string; lieuNaissance: string | null; nationalite: string | null };
  niveau: { id: string; nom: string } | null;
  typeEleve: StudentKind;
  ancienEtablissement: string | null;
  classePrecedente: { id: string; nom: string } | null;
  bulletin: { nom: string | null; type: string | null; taille: number | null } | null;
  statut: PreRegistrationStatus;
  motifRejet: string | null;
  studentId: string | null;
  enrollmentId: string | null;
  traiteLe: string | null;
}

export interface PreRegistrationView {
  id: string;
  reference: string;
  statut: RequestOverview;
  compte: { enfants: number; enAttente: number; acceptes: number; refuses: number };
  responsable: { nom: string; prenom: string; telephone: string; email: string | null };
  message: string | null;
  createdAt: string;
  enfants: PreRegistrationChildView[];
}

/** Ce que l'API renvoie au dépôt : ce qui a réellement été enregistré, enfant par enfant. */
export interface SubmissionReceipt {
  reference: string;
  responsable: { prenom: string; nom: string };
  enfants: Array<{
    prenom: string;
    nom: string;
    classeDemandee: string;
    typeEleve: StudentKind;
    classePrecedente: string | null;
    ancienEtablissement: string | null;
    bulletinJoint: boolean;
  }>;
}

// Accesseurs plutôt que des valeurs : le texte est lu au moment de l'affichage, dans la langue courante
// (une constante évaluée au chargement resterait figée dans la langue de départ).
export const STATUT_LABEL: Record<PreRegistrationStatus, string> = {
  get EN_ATTENTE() {
    return translate("stu.pre.statusPending");
  },
  get ACCEPTEE() {
    return translate("stu.pre.statusAccepted");
  },
  get REJETEE() {
    return translate("stu.pre.statusRejected");
  },
};

export const STATUT_COLOR: Record<PreRegistrationStatus, "orange" | "green" | "red"> = {
  EN_ATTENTE: "orange",
  ACCEPTEE: "green",
  REJETEE: "red",
};

export function studentName(s: { nom: string; prenom: string }): string {
  return `${s.prenom} ${s.nom}`;
}

/** Date lisible JJ/MM/AAAA d'un jour « AAAA-MM-JJ » ou d'un instant ISO. */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Taille lisible d'un fichier : « 240 Ko » ou « 1,2 Mo ». */
export function fileSizeLabel(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ${translate("cnt.pre.unitKb")}`;
  const mb = (bytes / 1024 / 1024).toLocaleString(INTL_LOCALE[getLocale()], { maximumFractionDigits: 1 });
  return `${mb} ${translate("cnt.pre.unitMb")}`;
}

/** Vrai si le fichier a l'un des types acceptés pour un bulletin (le serveur revérifie d'après le contenu). */
export function isBulletinType(file: { name: string; type: string }): boolean {
  if (["application/pdf", "image/jpeg", "image/png"].includes(file.type)) return true;
  return /\.(pdf|jpe?g|png)$/i.test(file.name);
}

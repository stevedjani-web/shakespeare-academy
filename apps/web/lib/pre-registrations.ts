// Préinscription en ligne (Lot 21) : types renvoyés par l'API et libellés.
import { translate } from "@/lib/i18n";

export type PreRegistrationStatus = "EN_ATTENTE" | "ACCEPTEE" | "REJETEE";

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

export interface PreRegistrationView {
  id: string;
  reference: string;
  eleve: { nom: string; prenom: string; sexe: "M" | "F"; dateNaissance: string; lieuNaissance: string | null; nationalite: string | null };
  niveau: { id: string; nom: string } | null;
  responsable: { nom: string; prenom: string; telephone: string; email: string | null };
  message: string | null;
  statut: PreRegistrationStatus;
  motifRejet: string | null;
  studentId: string | null;
  enrollmentId: string | null;
  createdAt: string;
  traiteLe: string | null;
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

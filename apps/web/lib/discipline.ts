// Discipline (Lot 20) : types renvoyés par l'API et libellés. Aucun texte sensible n'est conservé hors de l'écran.

export type DisciplineNature = "INCIDENT" | "VALORISATION";
export type DisciplineGravite = "LEGER" | "MOYEN" | "GRAVE";
export type DisciplineRecordStatus = "OUVERT" | "TRAITE" | "ANNULE";
export type SanctionStatus = "DECIDEE" | "PUBLIEE" | "ANNULEE";

export interface DisciplineType {
  id: string;
  nature: DisciplineNature;
  nom: string;
  actif: boolean;
}

export interface SanctionType {
  id: string;
  nom: string;
  actif: boolean;
}

export interface PersonRef {
  id: string;
  nom: string;
  prenom: string;
}

export interface StudentRef extends PersonRef {
  matricule: string;
}

export interface SanctionView {
  id: string;
  type: string;
  statut: SanctionStatus;
  dateDebut: string;
  dateFin: string | null;
  // Absents pour un enseignant : il ne voit jamais le message destiné à la famille.
  messageFamille?: string | null;
  publieLe?: string | null;
  motifAnnulation?: string | null;
}

export interface DisciplineRecord {
  id: string;
  nature: DisciplineNature;
  type: { id: string; nom: string };
  dateFaits: string;
  gravite: DisciplineGravite | null;
  description: string;
  statut: DisciplineRecordStatus;
  classe: string;
  eleve: StudentRef;
  auteur: PersonRef;
  motifClassement: string | null;
  motifAnnulation: string | null;
  createdAt: string;
  sanctions: SanctionView[];
}

export interface ConvocationView {
  id: string;
  eleve: StudentRef | null;
  recordId: string | null;
  dateRdv: string;
  lieu: string;
  objet: string;
  statut: "ENVOYEE" | "ANNULEE";
  accuseLe: string | null;
  issue: "PRESENT" | "ABSENT" | null;
  motifAnnulation: string | null;
}

export interface PendingSanction {
  id: string;
  recordId: string;
  type: string;
  statut: SanctionStatus;
  dateDebut: string;
  dateFin: string | null;
  messageFamille: string | null;
  eleve: StudentRef;
  classe: string;
  dateFaits: string;
}

export interface ClassRef {
  id: string;
  nom: string;
}

export const GRAVITE_LABEL: Record<DisciplineGravite, string> = { LEGER: "Léger", MOYEN: "Moyen", GRAVE: "Grave" };
export const GRAVITE_COLOR: Record<DisciplineGravite, "green" | "orange" | "red"> = { LEGER: "green", MOYEN: "orange", GRAVE: "red" };

export const STATUT_LABEL: Record<DisciplineRecordStatus, string> = { OUVERT: "Ouvert", TRAITE: "Traité", ANNULE: "Annulé" };
export const STATUT_COLOR: Record<DisciplineRecordStatus, "blue" | "green" | "gray"> = { OUVERT: "blue", TRAITE: "green", ANNULE: "gray" };

export const SANCTION_LABEL: Record<SanctionStatus, string> = {
  DECIDEE: "Décidée, à publier",
  PUBLIEE: "Publiée à la famille",
  ANNULEE: "Annulée",
};
export const SANCTION_COLOR: Record<SanctionStatus, "orange" | "green" | "gray"> = { DECIDEE: "orange", PUBLIEE: "green", ANNULEE: "gray" };

export const ISSUE_LABEL = { PRESENT: "Famille présente", ABSENT: "Famille absente" } as const;

export function studentName(s: { nom: string; prenom: string }): string {
  return `${s.prenom} ${s.nom}`;
}

/** Date lisible JJ/MM/AAAA d'un jour « AAAA-MM-JJ ». */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Date et heure locales d'un instant ISO, pour un rendez-vous. */
export function dateTimeLabel(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} à ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

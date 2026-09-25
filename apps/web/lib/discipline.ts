// Discipline (Lot 20) : types renvoyés par l'API et libellés. Aucun texte sensible n'est conservé hors de l'écran.
import { translate, type MessageKey } from "@/lib/i18n";

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

// Les libellés des codes du serveur sont des clés de dictionnaire. Les tables *_LABEL ci-dessous se lisent au moment de
// l'accès (getters) : la langue courante s'applique, même pour une table importée telle quelle par un écran.
const GRAVITE_KEY: Record<DisciplineGravite, MessageKey> = {
  LEGER: "acd.disc.gravite.LEGER",
  MOYEN: "acd.disc.gravite.MOYEN",
  GRAVE: "acd.disc.gravite.GRAVE",
};
const STATUT_KEY: Record<DisciplineRecordStatus, MessageKey> = {
  OUVERT: "acd.disc.statut.OUVERT",
  TRAITE: "acd.disc.statut.TRAITE",
  ANNULE: "acd.disc.statut.ANNULE",
};
const SANCTION_KEY: Record<SanctionStatus, MessageKey> = {
  DECIDEE: "acd.disc.sanction.DECIDEE",
  PUBLIEE: "acd.disc.sanction.PUBLIEE",
  ANNULEE: "acd.disc.sanction.ANNULEE",
};
const ISSUE_KEY: Record<"PRESENT" | "ABSENT", MessageKey> = {
  PRESENT: "acd.disc.issue.PRESENT",
  ABSENT: "acd.disc.issue.ABSENT",
};
const NATURE_KEY: Record<DisciplineNature, MessageKey> = {
  INCIDENT: "acd.disc.nature.INCIDENT",
  VALORISATION: "acd.disc.nature.VALORISATION",
};

export function graviteLabel(g: DisciplineGravite): string {
  return translate(GRAVITE_KEY[g]);
}
export function statutLabel(s: DisciplineRecordStatus): string {
  return translate(STATUT_KEY[s]);
}
export function sanctionLabel(s: SanctionStatus): string {
  return translate(SANCTION_KEY[s]);
}
export function issueLabel(i: "PRESENT" | "ABSENT"): string {
  return translate(ISSUE_KEY[i]);
}
/** « Incident » ou « Valorisation » dans la langue courante. */
export function natureLabel(n: DisciplineNature): string {
  return translate(NATURE_KEY[n]);
}

export const GRAVITE_LABEL: Record<DisciplineGravite, string> = {
  get LEGER() {
    return graviteLabel("LEGER");
  },
  get MOYEN() {
    return graviteLabel("MOYEN");
  },
  get GRAVE() {
    return graviteLabel("GRAVE");
  },
};
export const GRAVITE_COLOR: Record<DisciplineGravite, "green" | "orange" | "red"> = { LEGER: "green", MOYEN: "orange", GRAVE: "red" };

export const STATUT_LABEL: Record<DisciplineRecordStatus, string> = {
  get OUVERT() {
    return statutLabel("OUVERT");
  },
  get TRAITE() {
    return statutLabel("TRAITE");
  },
  get ANNULE() {
    return statutLabel("ANNULE");
  },
};
export const STATUT_COLOR: Record<DisciplineRecordStatus, "blue" | "green" | "gray"> = { OUVERT: "blue", TRAITE: "green", ANNULE: "gray" };

export const SANCTION_LABEL: Record<SanctionStatus, string> = {
  get DECIDEE() {
    return sanctionLabel("DECIDEE");
  },
  get PUBLIEE() {
    return sanctionLabel("PUBLIEE");
  },
  get ANNULEE() {
    return sanctionLabel("ANNULEE");
  },
};
export const SANCTION_COLOR: Record<SanctionStatus, "orange" | "green" | "gray"> = { DECIDEE: "orange", PUBLIEE: "green", ANNULEE: "gray" };

export const ISSUE_LABEL: Record<"PRESENT" | "ABSENT", string> = {
  get PRESENT() {
    return issueLabel("PRESENT");
  },
  get ABSENT() {
    return issueLabel("ABSENT");
  },
};

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
  return translate("disc.dateTime", {
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    hour: pad(d.getHours()),
    minute: pad(d.getMinutes()),
  });
}

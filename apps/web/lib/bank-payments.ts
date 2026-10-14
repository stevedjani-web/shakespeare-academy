import type { MessageKey } from "@/lib/i18n";

// Paiement par banque (virement, dépôt en banque, chèque) : types des réponses de l'API et contrôles d'envoi.

export type BankMethod = "VIREMENT" | "DEPOT_BANCAIRE" | "CHEQUE";
export const BANK_METHODS: BankMethod[] = ["VIREMENT", "DEPOT_BANCAIRE", "CHEQUE"];
export type BankClaimStatus = "EN_ATTENTE" | "CREDIT_CONFIRME" | "VALIDE" | "REJETE" | "RETIRE";

export const MAX_PROOFS = 3;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

export const methodKey = (m: BankMethod) => `bank.method.${m}` as MessageKey;
export const staffStatusKey = (s: BankClaimStatus) => `bank.status.${s}` as MessageKey;
export const parentStatusKey = (s: BankClaimStatus) => `bank.pstatus.${s}` as MessageKey;
export const referenceKey = (m: BankMethod) => `bank.form.ref.${m}` as MessageKey;

/** Un fichier de preuve : PDF, JPEG ou PNG de 5 Mo au plus (le serveur relit le contenu, ceci évite un envoi inutile). */
export function checkProofFile(file: File): MessageKey | null {
  const typeOk = file.type ? ALLOWED_TYPES.includes(file.type) : ALLOWED_EXTENSIONS.test(file.name);
  if (!typeOk) return "bank.form.fileType";
  if (file.size > MAX_PROOF_BYTES) return "bank.form.fileTooBig";
  return null;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export interface BankAccountInfo {
  id: string;
  banque: string;
  titulaire: string;
  numero: string;
  instructions: string | null;
}

export interface SchoolBankAccount extends BankAccountInfo {
  actif: boolean;
}

export interface BankTranche {
  trancheId: string;
  libelle: string;
  solde: number;
  enCours: number;
  disponible: number;
  dateLimite: string;
  enRetard: boolean;
  classe: string;
}

export interface BankStudentContext {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  tranches: BankTranche[];
}

export interface PortalBankContext {
  actif: boolean;
  comptes: BankAccountInfo[];
  enfants: BankStudentContext[];
  maxEnAttente: number;
}

export interface PortalBankClaim {
  id: string;
  statut: BankClaimStatus;
  methode: BankMethod;
  montant: number;
  banque: string;
  referenceOperation: string;
  dateOperation: string;
  createdAt: string;
  pieces: number;
  motifRejet: string | null;
  excedent: number;
  excedentRegle: boolean;
  lignes: {
    libelle: string;
    eleve: { id: string; prenom: string };
    montantDeclare: number;
    montantValide: number | null;
    paiement: { id: string; numeroRecu: string } | null;
  }[];
}

export interface StaffBankClaim {
  id: string;
  statut: BankClaimStatus;
  methode: BankMethod;
  montant: number;
  banque: string;
  compte: { banque: string; titulaire: string } | null;
  referenceOperation: string;
  dateOperation: string;
  payeur: string | null;
  note: string | null;
  createdAt: string;
  declarant: { type: "PARENT" | "PERSONNEL"; nom: string | null };
  declareParId: string | null;
  famille: { nom: string | null; telephone: string | null } | null;
  montantCredite: number | null;
  dateCredit: string | null;
  referenceReleve: string | null;
  confirmePar: string | null;
  confirmeParId: string | null;
  confirmeLe: string | null;
  validePar: string | null;
  valideLe: string | null;
  excedent: number;
  motifExcedent: string | null;
  excedentRegle: boolean;
  motifRegle: string | null;
  motifRejet: string | null;
  preuves: { id: string; nomAffiche: string; mimeType: string }[];
  lignes: {
    id: string;
    trancheId: string;
    libelle: string;
    eleve: { id: string; nom: string; prenom: string; matricule: string };
    classe: string;
    montantDeclare: number;
    montantValide: number | null;
    soldeActuel: number;
    paiement: { id: string; numeroRecu: string } | null;
  }[];
}

export interface BankSummary {
  aConfirmer: { count: number; total: number };
  aValider: { count: number; total: number };
  valides: { count: number; total: number };
  refuses: { count: number; total: number };
  excedentsAregler: { count: number; total: number };
}

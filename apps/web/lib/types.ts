export interface CurrentUser {
  id: string;
  schoolId: string;
  roleId: string;
  roleCode: string;
  permissions: string[];
  nom: string;
  prenom: string;
  email: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    nom: string;
    prenom: string;
    email: string;
    roleCode: string;
    doitChangerMotDePasse: boolean;
  };
}

export interface School {
  id: string;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  logoUrl: string | null;
  devise: string;
  fuseauHoraire: string;
}

export type AcademicYearStatus = "BROUILLON" | "ACTIVE" | "CLOTUREE";

export interface AcademicYear {
  id: string;
  libelle: string;
  dateDebut: string;
  dateFin: string;
  statut: AcademicYearStatus;
  dateDebutInscriptions: string | null;
  dateFinInscriptions: string | null;
}

export interface Section {
  id: string;
  code: string;
  nom: string;
}

export interface Cycle {
  id: string;
  sectionId: string;
  code: string;
  nom: string;
  ordre: number;
}

export interface Level {
  id: string;
  cycleId: string;
  code: string;
  nom: string;
  ordre: number;
}

export interface Class {
  id: string;
  levelId: string;
  academicYearId: string;
  nom: string;
  serie: string | null;
  groupe: string | null;
  capacite: number | null;
}

export interface Role {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  permissions: string[];
}

export interface Permission {
  id: string;
  code: string;
  description: string | null;
}

export type UserStatus = "ACTIF" | "INACTIF";

export interface AppUser {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  statut: UserStatus;
  doitChangerMotDePasse: boolean;
  dernierLoginAt: string | null;
  role: { id: string; code: string; nom: string };
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entite: string;
  entiteId: string | null;
  ancienneValeur: unknown;
  nouvelleValeur: unknown;
  createdAt: string;
  user: { nom: string; prenom: string; email: string } | null;
}

export type Sexe = "M" | "F";
export type StudentStatus = "ACTIF" | "INACTIF";

export interface Guardian {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string | null;
  profession: string | null;
  adresse: string | null;
}

export interface StudentGuardianLink {
  id: string;
  guardianId: string;
  lien: string;
  prioritaire: boolean;
  guardian: Guardian;
}

export interface Student {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  sexe: Sexe;
  dateNaissance: string;
  nationalite: string | null;
  statut: StudentStatus;
}

export interface StudentDossier extends Student {
  studentGuardians: StudentGuardianLink[];
  enrollments: Enrollment[];
}

export type EnrollmentType = "INSCRIPTION" | "REINSCRIPTION";
export type EnrollmentStatus = "ACTIVE" | "ANNULEE";

export interface Enrollment {
  id: string;
  numero: string;
  type: EnrollmentType;
  statut: EnrollmentStatus;
  motifAnnulation: string | null;
  dateInscription: string;
  student?: { id: string; matricule: string; nom: string; prenom: string };
  class: { id: string; nom: string; levelId?: string } & Partial<{
    level: { id: string; nom: string; cycle: { id: string; nom: string; section: { id: string; nom: string } } };
  }>;
  academicYear: { id: string; libelle: string };
}

// --- Lot 3 : tarifs, factures, remises, solvabilité -------------------------

export type FeeApplicability = "TOUS" | "INSCRIPTION" | "REINSCRIPTION";

export interface FeeType {
  id: string;
  code: string;
  nom: string;
  obligatoire: boolean;
  avecTranches: boolean;
  appliesTo: FeeApplicability;
}

export interface InstallmentSchedule {
  id: string;
  libelle: string;
  montant: number;
  ordre: number;
  dateLimite: string;
  delaiGraceJours: number;
}

export interface FeeSchedule {
  id: string;
  academicYearId: string;
  levelId: string;
  feeTypeId: string;
  montant: number | null;
  feeType: FeeType;
  level: { id: string; nom: string };
  academicYear: { id: string; libelle: string };
  installments: InstallmentSchedule[];
}

export type DiscountType = "MONTANT_FIXE" | "POURCENTAGE";
export type DiscountStatus = "EN_ATTENTE" | "APPROUVEE" | "REJETEE";

export interface Discount {
  id: string;
  type: DiscountType;
  valeur: number;
  motif: string;
  statut: DiscountStatus;
  motifRejet: string | null;
  dateDecision: string | null;
  auteur: { id: string; nom: string; prenom: string };
  approbateur: { id: string; nom: string; prenom: string } | null;
}

export type PaymentMode = "ESPECES" | "MOBILE_MONEY";
export type PaymentStatus = "VALIDE" | "ANNULE";

export interface Payment {
  id: string;
  numeroRecu: string;
  verificationToken: string;
  montant: number;
  modePaiement: PaymentMode;
  referenceExterne: string | null;
  datePaiement: string;
  statut: PaymentStatus;
  motifAnnulation: string | null;
  recuParUser: { id: string; nom: string; prenom: string };
  annuleParUser: { id: string; nom: string; prenom: string } | null;
  invoiceLine?: InvoiceLine & {
    invoice: {
      enrollment: {
        student: { id: string; nom: string; prenom: string; matricule: string };
        class: { id: string; nom: string };
        academicYear: { id: string; libelle: string };
      };
    };
  };
}

export interface InvoiceLine {
  id: string;
  libelle: string;
  montant: number;
  dateEcheance: string | null;
  delaiGraceJours: number;
  ordre: number;
  feeType: FeeType;
  discounts: Discount[];
  payments?: Payment[];
}

export type InvoiceStatus = "EMISE" | "ANNULEE";

export interface Invoice {
  id: string;
  statut: InvoiceStatus;
  dateEmission: string;
  lines: InvoiceLine[];
  enrollment: { id: string; numero: string };
}

export type SolvencyStatus = "SOLVABLE" | "A_ECHOIR" | "EN_RETARD" | "IMPAYE_CRITIQUE" | "EXONERE";

export interface FinancialStatus {
  statut: SolvencyStatus;
  montantFacture: number;
  montantRemise: number;
  montantPaye: number;
  montantRestant: number;
  montantExigible: number;
  montantAEchoir: number;
  prochaineEcheance: { libelle: string; montant: number; dateLimite: string; enRetard: boolean } | null;
  lignesEnRetard: Array<{ invoiceId: string; invoiceLineId: string; libelle: string; montant: number; dateLimite: string }>;
}

// --- Lot 5 : sorties financières, clôture de journée, insolvables ----------

export type ExpenseCategory = "VERSEMENT_BANQUE" | "PAIEMENT_SALAIRE" | "PAIEMENT_FACTURE" | "ACHAT_MATERIEL" | "AUTRE";
export type ExpenseStatus = "EN_ATTENTE" | "APPROUVEE" | "REJETEE";

export interface Expense {
  id: string;
  categorie: ExpenseCategory;
  montant: number;
  description: string;
  dateDepense: string;
  statut: ExpenseStatus;
  motifRejet: string | null;
  dateDecision: string | null;
  effectuePar: { id: string; nom: string; prenom: string };
  approbateur: { id: string; nom: string; prenom: string } | null;
}

export interface CashClosingEntry {
  id: string;
  numeroRecu: string;
  montant: number;
  modePaiement: PaymentMode;
  datePaiement: string;
  libelle: string;
  eleve: string | null;
  recuPar: string;
}

export interface CashClosingExpense {
  id: string;
  categorie: ExpenseCategory;
  montant: number;
  description: string;
  dateDepense: string;
  effectuePar: string;
}

export interface CashClosing {
  date: string;
  entrees: {
    total: number;
    count: number;
    parMode: Record<PaymentMode, number>;
    items: CashClosingEntry[];
  };
  sorties: {
    total: number;
    count: number;
    parCategorie: Record<string, number>;
    items: CashClosingExpense[];
  };
  soldeJour: number;
  soldeCumule: number;
}

export interface InsolventStudent {
  student: { id: string; nom: string; prenom: string; matricule: string };
  classe: string | null;
  guardian: { nom: string; telephone: string } | null;
  statut: SolvencyStatus;
  montantExigible: number;
  montantRestant: number;
  prochaineEcheance: { libelle: string; montant: number; dateLimite: string; enRetard: boolean } | null;
}

export interface DashboardStats {
  anneeActive: string | null;
  effectifs: {
    total: number;
    actifs: number;
    inactifs: number;
    parSexe: { M: number; F: number };
  };
  repartition: {
    parSection: Array<{ nom: string; effectif: number }>;
    parClasse: Array<{ nom: string; cycle: string; section: string; effectif: number }>;
  };
  inscriptions: { nouvelles: number; reinscriptions: number; annulees: number };
  financier: {
    totalFacture: number;
    totalRemises: number;
    totalEncaisse: number;
    totalRestantDu: number;
    tauxRecouvrement: number | null;
    soldeCaisseCumule: number;
  };
  paiements: { parMode: { ESPECES: number; MOBILE_MONEY: number } };
  remises: { enAttente: number; approuvees: number; rejetees: number };
  depenses: { totalApprouve: number; enAttenteCount: number; enAttenteMontant: number };
  insolvables: { count: number };
}

export interface StudentByClassRow {
  id: string;
  section: string;
  cycle: string;
  classe: string;
  annee: string;
  matricule: string;
  nom: string;
  prenom: string;
  sexe: "M" | "F";
  dateNaissance: string;
  statut: string;
  responsable: string;
  telephoneResponsable: string;
}

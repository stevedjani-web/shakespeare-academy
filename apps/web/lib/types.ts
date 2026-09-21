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
  // Paiement des frais par les parents (Mobile Money), activé par l'Administrateur.
  paiementEnLigneActif: boolean;
  // Durée de validité d'un code d'activation de compte parent, en jours.
  parentCodeValiditeJours: number;
  // Documents officiels : signataire, ville et image de signature des attestations.
  directeurNom: string | null;
  directeurTitre: string;
  ville: string | null;
  signatureUrl: string | null;
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
  lieuNaissance?: string | null;
  nationalite: string | null;
  // Référence de la photo (jamais une adresse publique : la photo se lit avec le jeton, voir StudentPhoto).
  photoUrl?: string | null;
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
  numeroProvisoire?: string | null;
  montant: number;
  modePaiement: PaymentMode;
  referenceExterne: string | null;
  datePaiement: string;
  statut: PaymentStatus;
  motifAnnulation: string | null;
  recuParUser: { id: string; nom: string; prenom: string } | null;
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

// --- Lot 7 : vie scolaire, référentiel pédagogique et personnel -------------

export type TimeSlotType = "COURS" | "PAUSE";

export interface TimeSlot {
  id: string;
  sectionId: string | null;
  libelle: string;
  heureDebut: string;
  heureFin: string;
  type: TimeSlotType;
}

export interface Room {
  id: string;
  nom: string;
  capacite: number | null;
  actif: boolean;
}

export interface Subject {
  id: string;
  code: string;
  nom: string;
  actif: boolean;
  levels: Array<{ id: string; levelId: string; minutesParSemaine: number | null }>;
  _count: { teachers: number; assignments: number };
}

export interface Teacher {
  id: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  email: string | null;
  statut: "ACTIF" | "INACTIF";
  volontairePilote: boolean;
  userId: string | null;
  modePointage: "SEANCE" | "JOURNEE";
  subjects: Array<{ subjectId: string; subject: { id: string; code: string; nom: string } }>;
  _count: { assignments: number };
}

export interface ClassAssignments {
  classe: Class;
  matieres: Array<{
    subject: { id: string; code: string; nom: string };
    minutesParSemaine: number | null;
    assignment: { id: string; teacherId: string; teacher: { id: string; nom: string; prenom: string } } | null;
  }>;
}

export interface Term {
  id: string;
  academicYearId: string;
  libelle: string;
  dateDebut: string;
  dateFin: string;
  ordre: number;
}

export type CalendarEventType = "VACANCES" | "FERIE" | "AUTRE";

export interface CalendarEvent {
  id: string;
  academicYearId: string;
  type: CalendarEventType;
  libelle: string;
  dateDebut: string;
  dateFin: string;
}

export interface PedagogySummary {
  anneeScolaire: { id: string; libelle: string } | null;
  joursClasse: number[];
  creneaux: { communs: number; parSection: number };
  matieres: { total: number; sansNiveau: number };
  enseignants: { total: number; actifs: number; sansAffectation: number };
  affectations: { classes: number; classesCompletes: number; requises: number; manquantes: number };
  trimestres: number;
  calendrier: { vacances: number; feries: number; autres: number };
  salles: number;
  pilote: {
    classe: { id: string; nom: string } | null;
    enseignant: { id: string; nom: string; prenom: string } | null;
  };
}

// --- Lot 8 : emploi du temps ---------------------------------------------------

export type TimetableStatus = "BROUILLON" | "PUBLIE" | "ARCHIVE";

export interface Timetable {
  id: string;
  academicYearId: string;
  numero: number;
  statut: TimetableStatus;
  dateEffet: string | null;
  datePublication: string | null;
  _count: { entries: number };
}

export interface TimetableEntry {
  id: string;
  timetableId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId: string;
  timeSlotId: string;
  jourSemaine: number;
  heureDebut: string;
  heureFin: string;
  class: { id: string; nom: string; levelId: string };
  subject: { id: string; nom: string };
  teacher: { id: string; nom: string; prenom: string };
  room: { id: string; nom: string };
}

export type OccurrenceStatus = "NORMALE" | "ANNULEE" | "REMPLACEE" | "SALLE_MODIFIEE";

export interface Occurrence {
  entryId: string;
  date: string;
  jourSemaine: number;
  heureDebut: string;
  heureFin: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  roomId: string;
  roomName: string;
  statut: OccurrenceStatus;
  exception: { id: string; type: string; motif: string; enseignantInitial: string; salleInitiale: string } | null;
}

export interface TimetableDay {
  date: string;
  version: { id: string; numero: number } | null;
  sansClasse: { type: string; libelle: string } | null;
  seances: Occurrence[];
}

export interface TimetableWeek {
  debut: string;
  fin: string;
  jours: TimetableDay[];
}

export interface TimetableCheck {
  pret: boolean;
  seances: number;
  problemes: string[];
}

// --- Lot 9 : assiduité des élèves ------------------------------------------------

export type AttendanceStatus = "PRESENT" | "RETARD" | "ABSENT";
export type JustificationStatus = "EN_ATTENTE" | "ACCEPTEE" | "REFUSEE";

export interface AbsenceReason {
  id: string;
  libelle: string;
  actif: boolean;
}

export interface AttendanceDaySession extends Occurrence {
  appel: { id: string; par: string; absents: number; retards: number; eleves: number; horsLigne: boolean } | null;
}

export interface AttendanceDay {
  date: string;
  aujourdhui: string;
  verrouille: boolean;
  futur: boolean;
  sansClasse: { type: string; libelle: string } | null;
  seances: AttendanceDaySession[];
}

export interface SheetStudent {
  studentId: string;
  matricule: string;
  nom: string;
  prenom: string;
  recordId: string | null;
  statut: AttendanceStatus;
  minutesRetard: number | null;
  justification: {
    id: string;
    statut: JustificationStatus;
    motif: string | null;
    commentaire: string | null;
    horsDelai: boolean;
  } | null;
  corrections: number;
}

export interface AttendanceSheet {
  seance: Occurrence;
  date: string;
  aujourdhui: string;
  verrouille: boolean;
  parametres: { retardMaxMinutes: number };
  appel: { id: string; par: { id: string; nom: string }; pris: string; horsLigne: boolean } | null;
  eleves: SheetStudent[];
}

export interface AbsenceRow {
  recordId: string;
  date: string;
  heureDebut: string;
  heureFin: string;
  studentId: string;
  eleve: string;
  matricule: string;
  classe: string;
  matiere: string;
  enseignant: string;
  statut: AttendanceStatus;
  minutesRetard: number | null;
  justification: {
    id: string;
    statut: JustificationStatus;
    motif: string | null;
    commentaire: string | null;
    horsDelai: boolean;
    decision: string | null;
  } | null;
  corrections: Array<{ date: string; par: string; de: AttendanceStatus; vers: AttendanceStatus; motif: string }>;
}

export interface StudentAttendanceHistory {
  eleve: { id: string; nom: string; prenom: string; matricule: string };
  compteurs: { seancesAppelees: number; absences: number; retards: number; excusees: number; nonJustifiees: number };
  lignes: AbsenceRow[];
}

// --- Lot 10 : pointage des enseignants -------------------------------------------

export type PointageMode = "SEANCE" | "JOURNEE";
export type CheckinStatus = "EN_ATTENTE" | "VALIDE" | "REJETE";

export interface SessionCheckin {
  id: string;
  statut: CheckinStatus;
  source: "SCAN" | "MANUEL";
  debut: string | null;
  fin: string | null;
  retardMinutes: number | null;
  retardSignale: boolean;
  ecartSalle: boolean;
  horsLigne: boolean;
  motif: string | null;
}

export interface DayCheckin {
  id: string;
  statut: CheckinStatus;
  source: "SCAN" | "MANUEL";
  arrivee: string | null;
  depart: string | null;
  heurePrevue: string | null;
  retardMinutes: number | null;
  retardSignale: boolean;
  horsLigne: boolean;
  motif: string | null;
}

export interface ScanResult {
  mode: PointageMode;
  type: "DEBUT" | "FIN" | "ARRIVEE" | "DEPART";
  pointageId: string;
  heure: string | null;
  seance?: { className: string; subjectName: string; heureDebut: string; heureFin: string; roomName: string };
  heurePrevue?: string | null;
  retardMinutes: number;
  retardSignale: boolean;
  ecartSalle?: boolean;
  statut: CheckinStatus;
  horsLigne: boolean;
}

export interface MyCheckins {
  teacher: { id: string; nom: string; prenom: string; modePointage: PointageMode };
  date: string;
  sansClasse?: { type: string; libelle: string } | null;
  seances: Array<{
    entryId: string;
    className: string;
    subjectName: string;
    heureDebut: string;
    heureFin: string;
    roomName: string;
    pointage: SessionCheckin | null;
  }>;
  journee: DayCheckin | null;
}

export interface CheckinDay {
  date: string;
  aujourdhui: string;
  sansClasse: { type: string; libelle: string } | null;
  seances: Array<Occurrence & { pointage: SessionCheckin | null }>;
  orphelins: Array<SessionCheckin & { teacherId: string; teacherName: string; heureDebut: string; heureFin: string }>;
  journees: Array<{ teacherId: string; teacherName: string; prevue: boolean; pointage: DayCheckin | null }>;
}

export interface CheckinSummaryRow {
  teacherId: string;
  enseignant: string;
  mode: PointageMode;
  statutFiche: "ACTIF" | "INACTIF";
  confieesARemplacant: number;
  minutesEffectuees: number;
  retards: number;
  minutesRetard: number;
  seancesPrevues?: number;
  seancesTenues?: number;
  seancesEnAttente?: number;
  seancesRejetees?: number;
  seancesIncompletes?: number;
  seancesNonPointees?: number;
  joursPrevus?: number;
  joursPresents?: number;
  joursEnAttente?: number;
  joursRejetes?: number;
  joursIncomplets?: number;
  joursNonPointes?: number;
}

export interface CheckinSummary {
  mois: string;
  jusquau: string | null;
  toleranceRetardMinutes: number;
  enseignants: CheckinSummaryRow[];
}

export interface PointageCodeRow {
  type: "ENTREE" | "SALLE";
  roomId: string | null;
  nom: string;
  token: string | null;
}

export interface LinkableUser {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: string;
  teacherId: string | null;
}

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
  class: { id: string; nom: string } & Partial<{
    level: { id: string; nom: string; cycle: { id: string; nom: string; section: { id: string; nom: string } } };
  }>;
  academicYear: { id: string; libelle: string };
}

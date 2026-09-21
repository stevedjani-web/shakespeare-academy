import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const TIME_SLOT_TYPES = ['COURS', 'PAUSE'] as const;
export const CALENDAR_EVENT_TYPES = ['VACANCES', 'FERIE', 'AUTRE'] as const;
export const TEACHER_STATUSES = ['ACTIF', 'INACTIF'] as const;

// --- Paramètres (jours de classe, D52) ---------------------------------------------------------

export class UpdatePedagogySettingsDto {
  // 0 = dimanche ... 6 = samedi. Au moins un jour, sans doublon.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  joursClasse!: number[];
}

// --- Créneaux horaires (D52, D53) --------------------------------------------------------------

export class CreateTimeSlotDto {
  // Absent = grille commune à toutes les sections.
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsString()
  @MinLength(1)
  libelle!: string;

  @Matches(HEURE, { message: 'heureDebut doit être au format HH:mm.' })
  heureDebut!: string;

  @Matches(HEURE, { message: 'heureFin doit être au format HH:mm.' })
  heureFin!: string;

  @IsOptional()
  @IsEnum(TIME_SLOT_TYPES)
  type?: (typeof TIME_SLOT_TYPES)[number];
}

export class UpdateTimeSlotDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  libelle?: string;

  @IsOptional()
  @Matches(HEURE, { message: 'heureDebut doit être au format HH:mm.' })
  heureDebut?: string;

  @IsOptional()
  @Matches(HEURE, { message: 'heureFin doit être au format HH:mm.' })
  heureFin?: string;

  @IsOptional()
  @IsEnum(TIME_SLOT_TYPES)
  type?: (typeof TIME_SLOT_TYPES)[number];
}

// --- Salles ------------------------------------------------------------------------------------

export class CreateRoomDto {
  @IsString()
  @MinLength(1)
  nom!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacite?: number;
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacite?: number;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

// --- Matières (D54) ----------------------------------------------------------------------------

export class CreateSubjectDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  nom!: string;
}

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class SubjectLevelDto {
  @IsString()
  levelId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  minutesParSemaine?: number;
}

export class SetSubjectLevelsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubjectLevelDto)
  levels!: SubjectLevelDto[];
}

// --- Enseignants (D56) -------------------------------------------------------------------------

export class CreateTeacherDto {
  @IsString()
  @MinLength(1)
  nom!: string;

  @IsString()
  @MinLength(1)
  prenom!: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  prenom?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(TEACHER_STATUSES)
  statut?: (typeof TEACHER_STATUSES)[number];
}

export class SetTeacherSubjectsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  subjectIds!: string[];
}

// --- Affectations ------------------------------------------------------------------------------

export class CreateAssignmentDto {
  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  teacherId!: string;
}

export class UpdateAssignmentDto {
  @IsString()
  teacherId!: string;
}

// --- Trimestres et calendrier (D55) ------------------------------------------------------------

export class CreateTermDto {
  @IsString()
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  libelle!: string;

  @Matches(DATE, { message: 'dateDebut doit être au format AAAA-MM-JJ.' })
  dateDebut!: string;

  @Matches(DATE, { message: 'dateFin doit être au format AAAA-MM-JJ.' })
  dateFin!: string;

  // Absent = trimestre suivant dans l'année.
  @IsOptional()
  @IsInt()
  @Min(1)
  ordre?: number;
}

export class UpdateTermDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  libelle?: string;

  @IsOptional()
  @Matches(DATE, { message: 'dateDebut doit être au format AAAA-MM-JJ.' })
  dateDebut?: string;

  @IsOptional()
  @Matches(DATE, { message: 'dateFin doit être au format AAAA-MM-JJ.' })
  dateFin?: string;
}

export class CreateCalendarEventDto {
  @IsString()
  academicYearId!: string;

  @IsEnum(CALENDAR_EVENT_TYPES)
  type!: (typeof CALENDAR_EVENT_TYPES)[number];

  @IsString()
  @MinLength(1)
  libelle!: string;

  @Matches(DATE, { message: 'dateDebut doit être au format AAAA-MM-JJ.' })
  dateDebut!: string;

  // Absent = un seul jour (jour férié).
  @IsOptional()
  @Matches(DATE, { message: 'dateFin doit être au format AAAA-MM-JJ.' })
  dateFin?: string;
}

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsEnum(CALENDAR_EVENT_TYPES)
  type?: (typeof CALENDAR_EVENT_TYPES)[number];

  @IsOptional()
  @IsString()
  @MinLength(1)
  libelle?: string;

  @IsOptional()
  @Matches(DATE, { message: 'dateDebut doit être au format AAAA-MM-JJ.' })
  dateDebut?: string;

  @IsOptional()
  @Matches(DATE, { message: 'dateFin doit être au format AAAA-MM-JJ.' })
  dateFin?: string;
}

// --- Classe pilote et enseignant volontaire ----------------------------------------------------

export class SetPilotDto {
  // `null` explicite = retirer la désignation ; clé absente = inchangé.
  @IsOptional()
  @IsString()
  classId?: string | null;

  @IsOptional()
  @IsString()
  teacherId?: string | null;
}

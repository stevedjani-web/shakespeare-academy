import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const EXCEPTION_TYPES = [
  'ANNULEE',
  'REMPLACEE',
  'SALLE_MODIFIEE',
] as const;

export class CreateTimetableDto {
  @IsString()
  academicYearId!: string;

  // Version dont on copie les séances. Absent : la dernière version publiée de l'année, s'il y en a une.
  @IsOptional()
  @IsString()
  copyFromId?: string;

  // Vrai : partir d'un emploi du temps vide, sans rien copier.
  @IsOptional()
  @IsBoolean()
  vide?: boolean;
}

export class PublishTimetableDto {
  @Matches(DATE, { message: 'dateEffet doit être au format AAAA-MM-JJ.' })
  dateEffet!: string;
}

export class CreateEntryDto {
  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  timeSlotId!: string;

  @IsInt()
  @Min(0)
  @Max(6)
  jourSemaine!: number;

  @IsString()
  roomId!: string;
}

export class UpdateEntryDto {
  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  timeSlotId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  jourSemaine?: number;

  @IsOptional()
  @IsString()
  roomId?: string;
}

export class CreateExceptionDto {
  @Matches(DATE, { message: 'date doit être au format AAAA-MM-JJ.' })
  date!: string;

  @IsEnum(EXCEPTION_TYPES)
  type!: (typeof EXCEPTION_TYPES)[number];

  @IsString()
  @MinLength(1, { message: 'Le motif est obligatoire.' })
  motif!: string;

  // Requis pour REMPLACEE.
  @IsOptional()
  @IsString()
  replacementTeacherId?: string;

  // Requis pour SALLE_MODIFIEE.
  @IsOptional()
  @IsString()
  roomId?: string;
}

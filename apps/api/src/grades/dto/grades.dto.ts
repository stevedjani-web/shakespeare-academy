import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const NOTE_STATUSES = ['NOTE', 'ABSENT', 'DISPENSE', 'AUCUNE'] as const;
export type NoteStatusInput = (typeof NOTE_STATUSES)[number];

export class CreateEvaluationDto {
  @IsString()
  termId!: string;

  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  titre!: string;

  @Matches(DATE, { message: 'date doit être au format AAAA-MM-JJ.' })
  date!: string;

  // Absent = le barème par défaut de l'école (School.baremeDefaut).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  bareme?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  coefficient?: number;
}

export class UpdateEvaluationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  titre?: string;

  @IsOptional()
  @Matches(DATE, { message: 'date doit être au format AAAA-MM-JJ.' })
  date?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  bareme?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  coefficient?: number;
}

export class NoteItemDto {
  @IsString()
  studentId!: string;

  // AUCUNE efface la note (l'élève n'a pas encore de note à cette évaluation).
  @IsIn(NOTE_STATUSES)
  statut!: NoteStatusInput;

  // Obligatoire pour NOTE, refusée sinon. Au plus 2 décimales, entre 0 et le barème.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valeur?: number;
}

export class SaveNotesDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => NoteItemDto)
  notes!: NoteItemDto[];

  // Obligatoire pour corriger un trimestre déjà verrouillé.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motif?: string;
}

export class AppreciationItemDto {
  @IsString()
  studentId!: string;

  // Vide = efface l'appréciation.
  @IsString()
  @MaxLength(500)
  texte!: string;
}

export class SaveAppreciationsDto {
  @IsString()
  termId!: string;

  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AppreciationItemDto)
  items!: AppreciationItemDto[];
}

export class PeriodRefDto {
  @IsString()
  termId!: string;

  @IsString()
  classId!: string;
}

export class ReopenPeriodDto extends PeriodRefDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motif!: string;
}

export class SetBulletinAppreciationDto {
  // Vide = efface l'appréciation générale.
  @IsString()
  @MaxLength(1000)
  texte!: string;
}

export class GradeBandDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3)
  lettre!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  minimum!: number;
}

export class SectionLettersDto {
  @IsString()
  sectionId!: string;

  @IsBoolean()
  affichageLettres!: boolean;
}

export class UpdateGradeSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  baremeDefaut?: number;

  // null = aucune mention admis ou refusé.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  moyennePassage?: number | null;

  @IsOptional()
  @IsBoolean()
  bulletinAfficheRang?: boolean;

  // Remplace toutes les tranches (vide = plus aucune lettre affichée).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => GradeBandDto)
  bands?: GradeBandDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionLettersDto)
  sections?: SectionLettersDto[];
}

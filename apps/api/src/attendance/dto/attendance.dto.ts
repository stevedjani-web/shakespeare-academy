import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Un élève qui n'est pas simplement présent. Absent de la liste = présent (D60). */
export class AttendanceItemDto {
  @IsString()
  studentId!: string;

  // Vrai : absent de la séance, quelle que soit l'heure d'arrivée.
  @IsOptional()
  @IsBoolean()
  absent?: boolean;

  // Minutes de retard à l'arrivée ; le statut (retard ou absent) en est déduit selon le seuil paramétré.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  minutesRetard?: number;
}

export class SaveCallDto {
  @IsString()
  entryId!: string;

  @Matches(DATE, { message: 'date doit être au format AAAA-MM-JJ.' })
  date!: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AttendanceItemDto)
  absences!: AttendanceItemDto[];

  // Instant de saisie sur l'appareil, quand l'appel a été fait sans Internet.
  @IsOptional()
  @IsISO8601()
  saisiLe?: string;

  // Obligatoire pour toute correction : après le verrouillage, ou par un autre que l'auteur de l'appel.
  @IsOptional()
  @IsString()
  motif?: string;
}

export class CreateReasonDto {
  @IsString()
  @MinLength(1)
  libelle!: string;
}

export class UpdateReasonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  libelle?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class CreateJustificationDto {
  @IsOptional()
  @IsString()
  reasonId?: string;

  @IsOptional()
  @IsString()
  commentaire?: string;
}

export class DecideJustificationDto {
  @IsEnum(['ACCEPTEE', 'REFUSEE'])
  statut!: 'ACCEPTEE' | 'REFUSEE';

  @IsOptional()
  @IsString()
  commentaire?: string;
}

import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MinLength } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ScanDto {
  // Contenu du QR : le jeton lu dans l'adresse (?c=...).
  @IsString()
  @MinLength(8)
  code!: string;

  // Instant du scan sur l'appareil, quand il a été fait sans Internet et envoyé plus tard.
  @IsOptional()
  @IsISO8601()
  scanneLe?: string;
}

export class DecideCheckinDto {
  @IsEnum(['VALIDE', 'REJETE'])
  statut!: 'VALIDE' | 'REJETE';

  // Obligatoire pour un rejet.
  @IsOptional()
  @IsString()
  motif?: string;
}

export class ManualSessionDto {
  @IsString()
  entryId!: string;

  @Matches(DATE, { message: 'date doit être au format AAAA-MM-JJ.' })
  date!: string;

  @Matches(TIME, { message: 'debut doit être au format HH:mm.' })
  debut!: string;

  @Matches(TIME, { message: 'fin doit être au format HH:mm.' })
  fin!: string;

  @IsString()
  @MinLength(1, { message: 'Le motif est obligatoire.' })
  motif!: string;
}

export class ManualDayDto {
  @IsString()
  teacherId!: string;

  @Matches(DATE, { message: 'date doit être au format AAAA-MM-JJ.' })
  date!: string;

  @Matches(TIME, { message: 'arrivee doit être au format HH:mm.' })
  arrivee!: string;

  @IsOptional()
  @Matches(TIME, { message: 'depart doit être au format HH:mm.' })
  depart?: string;

  @IsString()
  @MinLength(1, { message: 'Le motif est obligatoire.' })
  motif!: string;
}

export class RotateCodeDto {
  // Absent : le QR de l'entrée de l'école.
  @IsOptional()
  @IsString()
  roomId?: string;
}

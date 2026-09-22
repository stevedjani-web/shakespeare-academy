import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Sexe, PreRegistrationStatus } from '@prisma/client';

export class CreatePreRegistrationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nom!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  prenom!: string;

  @IsEnum(Sexe)
  sexe!: Sexe;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date de naissance doit être au format AAAA-MM-JJ.' })
  dateNaissance!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lieuNaissance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationalite?: string;

  @IsString()
  @MinLength(1)
  levelId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  responsableNom!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  responsablePrenom!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(30)
  responsableTelephone!: string;

  @IsOptional()
  @IsEmail()
  responsableEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Le message est limité à 500 caractères.' })
  message?: string;
}

export class AcceptPreRegistrationDto {
  @IsString()
  @MinLength(1)
  classId!: string;

  @IsOptional()
  @IsBoolean()
  forcerCreation?: boolean;
}

export class RejectPreRegistrationDto {
  @IsString()
  @MinLength(3, { message: 'Indiquez le motif du refus (3 caractères au moins).' })
  @MaxLength(300)
  motif!: string;
}

export class TrackPreRegistrationQueryDto {
  @IsString()
  @MinLength(1)
  reference!: string;

  @IsString()
  @MinLength(1)
  telephone!: string;
}

export class ListPreRegistrationsQueryDto {
  @IsOptional()
  @IsEnum(PreRegistrationStatus)
  statut?: PreRegistrationStatus;
}

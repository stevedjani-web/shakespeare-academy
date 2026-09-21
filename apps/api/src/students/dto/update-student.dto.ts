import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Sexe, StudentStatus } from '@prisma/client';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  prenom?: string;

  @IsOptional()
  @IsEnum(Sexe)
  sexe?: Sexe;

  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lieuNaissance?: string;

  @IsOptional()
  @IsString()
  nationalite?: string;

  @IsOptional()
  @IsEnum(StudentStatus)
  statut?: StudentStatus;
}

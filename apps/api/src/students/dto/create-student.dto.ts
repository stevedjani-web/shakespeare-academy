import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Sexe } from '@prisma/client';
import { CreateGuardianDto } from './create-guardian.dto';

export class CreateStudentDto {
  @IsString()
  @MinLength(1)
  nom!: string;

  @IsString()
  @MinLength(1)
  prenom!: string;

  @IsEnum(Sexe)
  sexe!: Sexe;

  @IsDateString()
  dateNaissance!: string;

  @IsOptional()
  @IsString()
  nationalite?: string;

  // Matricule : laissé vide pour une génération automatique (D32, provisoire) ; fourni si l'école
  // a déjà sa propre règle de numérotation.
  @IsOptional()
  @IsString()
  matricule?: string;

  // D31 (révisé 17 septembre 2026) : un responsable n'est plus obligatoire à la création — utile
  // pour un import d'élèves déjà inscrits dont les contacts parents ne sont pas encore disponibles.
  // Reste ajoutable à tout moment via POST /students/:id/guardians (bouton "Ajouter" existant).
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateGuardianDto)
  responsable?: CreateGuardianDto;

  // D33 : un doublon potentiel (nom+prénom+date de naissance normalisés) est signalé en 409
  // par défaut ; ce booléen permet de confirmer explicitement la création malgré l'alerte.
  @IsOptional()
  @IsBoolean()
  forcerCreation?: boolean;
}

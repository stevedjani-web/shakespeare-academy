import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Interrupteur du paiement des frais par les parents (Lot 17). Faux tant que l'Administrateur ne l'active pas.
  @IsOptional()
  @IsBoolean()
  paiementEnLigneActif?: boolean;
}

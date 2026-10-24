import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  // E-mail ou numéro de téléphone du compte.
  @IsOptional()
  @IsString()
  @MinLength(1)
  identifiant?: string;

  // Ancien nom du champ (anciennes pages restées ouvertes) : même rôle que `identifiant`.
  @IsOptional()
  @IsString()
  @MinLength(1)
  email?: string;

  @IsString()
  @MinLength(1)
  motDePasse!: string;
}

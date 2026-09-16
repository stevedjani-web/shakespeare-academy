import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateGuardianDto {
  @IsString()
  @MinLength(1)
  nom!: string;

  @IsString()
  @MinLength(1)
  prenom!: string;

  @IsString()
  @MinLength(1)
  telephone!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  profession?: string;

  @IsOptional()
  @IsString()
  adresse?: string;

  @IsString()
  @MinLength(1)
  lien!: string;
}

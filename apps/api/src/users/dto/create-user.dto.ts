import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  nom!: string;

  @IsString()
  @MinLength(1)
  prenom!: string;

  // Au moins un des deux (vérifié par le service) : un enseignant peut se connecter avec son seul numéro de téléphone.
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsString()
  @MinLength(8)
  motDePasse!: string;

  @IsString()
  roleId!: string;
}

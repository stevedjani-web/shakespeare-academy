import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  prenom?: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  statut?: UserStatus;

  // `null` retire l'identifiant ; absent = inchangé. Un compte garde toujours au moins un des deux.
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsEmail()
  email?: string | null;

  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsString()
  telephone?: string | null;
}

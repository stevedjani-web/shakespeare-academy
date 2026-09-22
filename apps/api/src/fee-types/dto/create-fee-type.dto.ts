import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { FeeApplicability } from '@prisma/client';

export class CreateFeeTypeDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  nom!: string;

  @IsOptional()
  @IsBoolean()
  obligatoire?: boolean;

  @IsOptional()
  @IsBoolean()
  avecTranches?: boolean;

  // TOUS par défaut (ex. écolage) — INSCRIPTION/REINSCRIPTION pour un frais propre à un seul type
  // d'inscription (D39, DECISIONS_PENDING.md).
  @IsOptional()
  @IsEnum(FeeApplicability)
  appliesTo?: FeeApplicability;
}

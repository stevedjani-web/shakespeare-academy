import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { FeeApplicability } from '@prisma/client';

export class UpdateFeeTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsBoolean()
  obligatoire?: boolean;

  @IsOptional()
  @IsBoolean()
  avecTranches?: boolean;

  @IsOptional()
  @IsEnum(FeeApplicability)
  appliesTo?: FeeApplicability;
}

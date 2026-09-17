import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

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
}

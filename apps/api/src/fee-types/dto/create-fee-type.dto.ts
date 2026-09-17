import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

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
}

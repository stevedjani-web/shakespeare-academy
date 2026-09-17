import { IsDateString, IsInt, IsString, Min, MinLength } from 'class-validator';

export class InstallmentDto {
  @IsString()
  @MinLength(1)
  libelle!: string;

  @IsInt()
  @Min(1)
  montant!: number;

  @IsInt()
  @Min(1)
  ordre!: number;

  @IsDateString()
  dateLimite!: string;

  @IsInt()
  @Min(0)
  delaiGraceJours!: number;
}

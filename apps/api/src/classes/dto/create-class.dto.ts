import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateClassDto {
  @IsString()
  levelId!: string;

  @IsString()
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  nom!: string;

  // Colonnes prévues par anticipation de D02 (séries de lycée, sous-groupes) — non exploitées
  // tant que cette décision reste ouverte (voir DECISIONS_PENDING.md).
  @IsOptional()
  @IsString()
  serie?: string;

  @IsOptional()
  @IsString()
  groupe?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacite?: number;
}

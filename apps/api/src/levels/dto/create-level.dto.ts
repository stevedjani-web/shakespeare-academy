import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

// Contrairement aux codes de Section/Cycle (internes, MAJUSCULES_SNAKE_CASE), le code d'un niveau
// reprend souvent tel quel la nomenclature officielle de l'école (ex. "6e", "2nde C", "CP1") —
// pas de contrainte de casse ici.
export class CreateLevelDto {
  @IsString()
  cycleId!: string;

  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  nom!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordre?: number;
}

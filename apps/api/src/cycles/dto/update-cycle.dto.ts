import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateCycleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordre?: number;
}

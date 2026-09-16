import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

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

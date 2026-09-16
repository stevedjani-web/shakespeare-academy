import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;
}

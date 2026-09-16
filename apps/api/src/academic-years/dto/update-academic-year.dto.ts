import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAcademicYearDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  libelle?: string;

  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @IsOptional()
  @IsDateString()
  dateFin?: string;

  @IsOptional()
  @IsDateString()
  dateDebutInscriptions?: string;

  @IsOptional()
  @IsDateString()
  dateFinInscriptions?: string;
}

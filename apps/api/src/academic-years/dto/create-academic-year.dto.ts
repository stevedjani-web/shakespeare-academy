import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAcademicYearDto {
  @IsString()
  @MinLength(1)
  libelle!: string;

  @IsDateString()
  dateDebut!: string;

  @IsDateString()
  dateFin!: string;

  @IsOptional()
  @IsDateString()
  dateDebutInscriptions?: string;

  @IsOptional()
  @IsDateString()
  dateFinInscriptions?: string;
}

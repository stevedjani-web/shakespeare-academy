import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateEnrollmentDto {
  @IsString()
  studentId!: string;

  @IsString()
  classId!: string;

  @IsString()
  academicYearId!: string;

  // Facultatif : par défaut le serveur le déduit (réinscription si l'élève a déjà une inscription dans le
  // système, quel que soit son statut). Le choisir sert à déclarer une RÉINSCRIPTION pour un élève déjà
  // scolarisé à l'école avant l'utilisation de l'outil (aucune inscription antérieure enregistrée). Une
  // INSCRIPTION est refusée pour un élève qui a déjà une inscription dans le système.
  @IsOptional()
  @IsIn(['INSCRIPTION', 'REINSCRIPTION'])
  type?: 'INSCRIPTION' | 'REINSCRIPTION';
}

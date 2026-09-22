import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ConvocationIssue,
  DisciplineGravite,
  DisciplineNature,
  DisciplineRecordStatus,
  SanctionStatus,
} from '@prisma/client';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = 'La date doit être au format AAAA-MM-JJ.';

export class CreateRecordDto {
  @IsString()
  @MinLength(1)
  studentId!: string;

  @IsEnum(DisciplineNature, {
    message: 'Nature inconnue (incident ou valorisation).',
  })
  nature!: DisciplineNature;

  @IsString()
  @MinLength(1)
  typeId!: string;

  @Matches(DAY, { message: DAY_MESSAGE })
  dateFaits!: string;

  @IsOptional()
  @IsEnum(DisciplineGravite, {
    message: 'Gravité inconnue (léger, moyen ou grave).',
  })
  gravite?: DisciplineGravite;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La description est limitée à 2000 caractères.' })
  description?: string;
}

export class UpdateRecordDto {
  @IsOptional()
  @IsString()
  typeId?: string;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  dateFaits?: string;

  @IsOptional()
  @IsEnum(DisciplineGravite)
  gravite?: DisciplineGravite;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La description est limitée à 2000 caractères.' })
  description?: string;

  // Obligatoire dès que le signalement n'est plus modifiable par son auteur (jour de saisie révolu) : contrôlé par le service.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motif?: string;
}

/** Motif obligatoire : annuler, classer sans suite, annuler une sanction ou une convocation. */
export class MotifDto {
  @IsString()
  @MinLength(3, { message: 'Indiquez le motif (3 caractères au moins).' })
  @MaxLength(300)
  motif!: string;
}

export class DecideSanctionDto {
  @IsString()
  @MinLength(1)
  typeId!: string;

  @Matches(DAY, { message: DAY_MESSAGE })
  dateDebut!: string;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  dateFin?: string;

  // Seul texte libre montré à la famille : rédigé pour elle, sans le récit de l'incident.
  @IsOptional()
  @IsString()
  @MaxLength(300, {
    message: 'Le message à la famille est limité à 300 caractères.',
  })
  messageFamille?: string;
}

export class CreateConvocationDto {
  @IsString()
  @MinLength(1)
  studentId!: string;

  @IsOptional()
  @IsString()
  recordId?: string;

  @IsDateString(
    {},
    { message: 'La date et l’heure du rendez-vous sont invalides.' },
  )
  dateRdv!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  lieu!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  objet!: string;
}

export class ConvocationIssueDto {
  @IsEnum(ConvocationIssue, { message: 'Issue inconnue (présent ou absent).' })
  issue!: ConvocationIssue;
}

export class CreateDisciplineTypeDto {
  @IsEnum(DisciplineNature)
  nature!: DisciplineNature;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nom!: string;
}

export class CreateSanctionTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nom!: string;
}

export class UpdateCatalogueDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nom?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class ListRecordsQueryDto {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsEnum(DisciplineNature)
  nature?: DisciplineNature;

  @IsOptional()
  @IsEnum(DisciplineRecordStatus)
  statut?: DisciplineRecordStatus;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  to?: string;
}

export class ListSanctionsQueryDto {
  @IsOptional()
  @IsEnum(SanctionStatus)
  statut?: SanctionStatus;
}

export class ListConvocationsQueryDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsIn(['ENVOYEE', 'ANNULEE'])
  statut?: 'ENVOYEE' | 'ANNULEE';
}

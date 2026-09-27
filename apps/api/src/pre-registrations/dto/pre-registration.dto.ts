import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Sexe } from '@prisma/client';
import { msg } from '../../common/language';

/** Nombre maximal d'enfants dans une même demande (le formulaire public le respecte aussi). */
export const MAX_CHILDREN = 8;

/** Parent ou tuteur : saisi une seule fois pour toute la demande. */
export class PreRegistrationParentDto {
  @IsString()
  @MinLength(1, {
    message: msg(
      'Indiquez le nom du parent ou tuteur.',
      'Enter the parent or guardian last name.',
    ),
  })
  @MaxLength(80)
  nom!: string;

  @IsString()
  @MinLength(1, {
    message: msg(
      'Indiquez le prénom du parent ou tuteur.',
      'Enter the parent or guardian first name.',
    ),
  })
  @MaxLength(80)
  prenom!: string;

  @IsString()
  @MinLength(6, {
    message: msg(
      'Le téléphone du parent ou tuteur doit avoir 6 caractères au moins.',
      'The parent or guardian phone number must have at least 6 characters.',
    ),
  })
  @MaxLength(30)
  telephone!: string;

  @IsOptional()
  @IsEmail(
    {},
    {
      message: msg(
        'L’adresse e-mail du parent ou tuteur est invalide.',
        'The parent or guardian e-mail address is invalid.',
      ),
    },
  )
  email?: string;
}

/** Une fiche enfant : sa classe demandée, son statut (nouveau ou ancien) et ses informations propres. */
export class PreRegistrationChildDto {
  @IsString()
  @MinLength(1, {
    message: msg('Indiquez le nom de l’enfant.', 'Enter the child last name.'),
  })
  @MaxLength(80)
  nom!: string;

  @IsString()
  @MinLength(1, {
    message: msg(
      'Indiquez le prénom de l’enfant.',
      'Enter the child first name.',
    ),
  })
  @MaxLength(80)
  prenom!: string;

  @IsEnum(Sexe, {
    message: msg('Indiquez le sexe de l’enfant.', 'Enter the child sex.'),
  })
  sexe!: Sexe;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: msg(
      'La date de naissance doit être au format AAAA-MM-JJ.',
      'The date of birth must be in YYYY-MM-DD format.',
    ),
  })
  dateNaissance!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lieuNaissance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationalite?: string;

  // Classe demandée (le niveau ; la classe réelle est choisie par le secrétariat à l'acceptation).
  @IsString()
  @MinLength(1, {
    message: msg(
      'Choisissez la classe demandée.',
      'Choose the requested class.',
    ),
  })
  levelId!: string;

  // Choix obligatoire : nouvel élève ou ancien élève à l'école.
  @IsIn(['NOUVEAU', 'ANCIEN'], {
    message: msg(
      'Indiquez si l’enfant est un nouvel élève ou un ancien élève de l’école.',
      'State whether the child is a new student or a former student of the school.',
    ),
  })
  typeEleve!: 'NOUVEAU' | 'ANCIEN';

  // Nouvel élève : facultatif. Ignoré pour un ancien élève.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ancienEtablissement?: string;

  // Ancien élève : classe fréquentée l'année scolaire précédente, obligatoire (elle sert à retrouver son dossier).
  // Ignorée pour un nouvel élève.
  @ValidateIf((o: PreRegistrationChildDto) => o.typeEleve === 'ANCIEN')
  @IsString({
    message: msg(
      'Indiquez la classe fréquentée l’année scolaire précédente.',
      'Enter the class attended last school year.',
    ),
  })
  @MinLength(1, {
    message: msg(
      'Indiquez la classe fréquentée l’année scolaire précédente.',
      'Enter the class attended last school year.',
    ),
  })
  classePrecedenteLevelId?: string;
}

export class CreatePreRegistrationDto {
  @IsDefined({
    message: msg(
      'Indiquez le parent ou tuteur.',
      'Enter the parent or guardian.',
    ),
  })
  @ValidateNested()
  @Type(() => PreRegistrationParentDto)
  responsable!: PreRegistrationParentDto;

  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: msg(
      'Le message est limité à 500 caractères.',
      'The message is limited to 500 characters.',
    ),
  })
  message?: string;

  @IsArray({
    message: msg('Ajoutez au moins un enfant.', 'Add at least one child.'),
  })
  @ArrayMinSize(1, {
    message: msg('Ajoutez au moins un enfant.', 'Add at least one child.'),
  })
  @ArrayMaxSize(MAX_CHILDREN, {
    message: msg(
      `Une demande porte ${MAX_CHILDREN} enfants au plus : déposez-en une seconde pour les autres.`,
      `A request holds at most ${MAX_CHILDREN} children: submit a second request for the others.`,
    ),
  })
  @ValidateNested({ each: true })
  @Type(() => PreRegistrationChildDto)
  enfants!: PreRegistrationChildDto[];
}

export class AcceptPreRegistrationDto {
  @IsString()
  @MinLength(1)
  classId!: string;

  // Ancien élève : le dossier retrouvé par le secrétariat. Sans lui, un nouveau dossier élève est créé.
  @IsOptional()
  @IsString()
  @MinLength(1)
  studentId?: string;

  @IsOptional()
  @IsBoolean()
  forcerCreation?: boolean;
}

export class RejectPreRegistrationDto {
  @IsString()
  @MinLength(3, {
    message: 'Indiquez le motif du refus (3 caractères au moins).',
  })
  @MaxLength(300)
  motif!: string;
}

export class TrackPreRegistrationQueryDto {
  @IsString()
  @MinLength(1)
  reference!: string;

  @IsString()
  @MinLength(1)
  telephone!: string;
}

export class ListPreRegistrationsQueryDto {
  // EN_ATTENTE : au moins un enfant reste à traiter. TRAITEE : tous les enfants ont reçu une réponse.
  @IsOptional()
  @IsIn(['EN_ATTENTE', 'TRAITEE'])
  statut?: 'EN_ATTENTE' | 'TRAITEE';
}

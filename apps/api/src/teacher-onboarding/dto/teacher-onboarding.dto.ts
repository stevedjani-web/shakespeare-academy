import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { msg } from '../../common/language';
import {
  LINK_MAX_DAYS,
  MAX_DECLARED_CLASSES,
  MAX_OTHER_SUBJECTS,
  MAX_OTHER_SUBJECT_LENGTH,
} from '../teacher-onboarding.util';

export const MAX_DECLARED_SUBJECTS = 30;

/** Ce que l'enseignant envoie par le lien partagé. */
export class SubmitTeacherDto {
  @IsString()
  @MinLength(1, {
    message: msg('Indiquez votre nom.', 'Enter your last name.'),
  })
  @MaxLength(80)
  nom!: string;

  @IsString()
  @MinLength(1, {
    message: msg('Indiquez votre prénom.', 'Enter your first name.'),
  })
  @MaxLength(80)
  prenom!: string;

  // Le téléphone sert d'identifiant de connexion (8 chiffres au moins : contrôlé par le service).
  @IsString()
  @MinLength(8, {
    message: msg(
      'Le téléphone doit avoir 8 chiffres au moins.',
      'The phone number must have at least 8 digits.',
    ),
  })
  @MaxLength(30)
  telephone!: string;

  @IsOptional()
  @IsEmail(
    {},
    {
      message: msg(
        'L’adresse e-mail est invalide.',
        'The e-mail address is invalid.',
      ),
    },
  )
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  urgenceNom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  urgenceTelephone?: string;

  // Classes où l'enseignant intervient (de l'année active) : au moins une. Une indication pour le secrétariat, qui prépare
  // les affectations : elles ne s'appliquent jamais toutes seules.
  @IsArray({
    message: msg(
      'Indiquez au moins une classe où vous enseignez.',
      'Select at least one class where you teach.',
    ),
  })
  @ArrayMinSize(1, {
    message: msg(
      'Indiquez au moins une classe où vous enseignez.',
      'Select at least one class where you teach.',
    ),
  })
  @ArrayMaxSize(MAX_DECLARED_CLASSES, {
    message: msg(
      'Trop de classes : 15 au plus.',
      'Too many classes: 15 at most.',
    ),
  })
  @IsString({ each: true })
  classes!: string[];

  // Matières enseignées : demandées seulement pour le collège et le lycée (le serveur l'impose d'après les classes), une
  // indication, les affectations restent décidées par l'école.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DECLARED_SUBJECTS)
  @IsString({ each: true })
  matieres?: string[];

  // Matières absentes de la liste, tapées par l'enseignant : du texte libre, lu par le secrétariat.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OTHER_SUBJECTS, {
    message: msg(
      'Trop de matières ajoutées : 5 au plus.',
      'Too many subjects added: 5 at most.',
    ),
  })
  @IsString({ each: true })
  @MaxLength(MAX_OTHER_SUBJECT_LENGTH, {
    each: true,
    message: msg(
      'Une matière ajoutée est trop longue : 60 caractères au plus.',
      'An added subject is too long: 60 characters at most.',
    ),
  })
  autresMatieres?: string[];

  // Choisi par l'enseignant : il lui sert à se connecter dès que le secrétariat a validé sa demande.
  @IsString()
  @MinLength(8, {
    message: msg(
      'Le mot de passe doit contenir au moins 8 caractères.',
      'The password must be at least 8 characters long.',
    ),
  })
  @MaxLength(100)
  motDePasse!: string;

  @IsBoolean()
  consentement!: boolean;

  @IsString()
  versionPolitique!: string;
}

export class CreateTeacherLinkDto {
  // Vrai : un nouveau jeton remplace l'ancien, qui cesse aussitôt de fonctionner.
  @IsOptional()
  @IsBoolean()
  regenerer?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(LINK_MAX_DAYS)
  validiteJours?: number;
}

export class UpdateTeacherLinkDto {
  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  // Repousse l'échéance de ce nombre de jours à partir d'aujourd'hui (ou de l'échéance si elle est plus tardive).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(LINK_MAX_DAYS)
  prolongerJours?: number;
}

export class ListTeacherSubmissionsQueryDto {
  @IsOptional()
  @IsIn(['EN_ATTENTE', 'TRAITEES'])
  statut?: 'EN_ATTENTE' | 'TRAITEES';
}

export class AnalyseTeacherSubmissionQueryDto {
  @IsOptional()
  @IsString()
  teacherId?: string;
}

export class ValidateTeacherSubmissionDto {
  // Fiche existante à laquelle rattacher la demande, ou création d'une nouvelle fiche : l'un ou l'autre.
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsBoolean()
  creerFiche?: boolean;

  // SEANCE : QR de la salle à chaque cours ; JOURNEE : QR de l'entrée. Absent : celui de la fiche (SEANCE pour une nouvelle).
  @IsOptional()
  @IsIn(['SEANCE', 'JOURNEE'])
  modePointage?: 'SEANCE' | 'JOURNEE';

  // Le secrétariat a lu les alertes à confirmer (valeur différente de celle de la fiche, e-mail déjà pris...).
  @IsOptional()
  @IsBoolean()
  confirmer?: boolean;
}

export class RefuseTeacherSubmissionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  motif!: string;
}

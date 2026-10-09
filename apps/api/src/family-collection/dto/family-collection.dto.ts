import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { msg } from '../../common/language';

/** Enfants d'une même soumission : au-delà, le parent dépose une seconde fois. */
export const MAX_FAMILY_CHILDREN = 8;

/** Liens proposés au parent (texte libre côté dossier, mais une liste courte côté formulaire). */
export const FAMILY_LINKS = ['Père', 'Mère', 'Tuteur légal', 'Autre'] as const;

export class FamilyParentDto {
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

  // Le téléphone sert d'identifiant de connexion à l'espace parents.
  @IsString()
  @MinLength(6, {
    message: msg(
      'Le téléphone doit avoir 6 caractères au moins.',
      'The phone number must have at least 6 characters.',
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
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  profession?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  adresse?: string;

  @IsOptional()
  @IsIn([...FAMILY_LINKS], {
    message: msg('Lien de parenté inconnu.', 'Unknown family relationship.'),
  })
  lien?: (typeof FAMILY_LINKS)[number];
}

export class FamilyChildDto {
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

  // Classe de l'enfant : celle du lien par défaut, à préciser pour un frère ou une sœur d'une autre classe.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  classId?: string;
}

export class SubmitFamilyDto {
  @IsDefined({
    message: msg('Indiquez vos informations.', 'Enter your details.'),
  })
  @ValidateNested()
  @Type(() => FamilyParentDto)
  responsable!: FamilyParentDto;

  // Choisi par le parent : il lui sert à se connecter dès que l'école a validé sa demande.
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

  @IsArray({
    message: msg('Ajoutez au moins un enfant.', 'Add at least one child.'),
  })
  @ArrayMinSize(1, {
    message: msg('Ajoutez au moins un enfant.', 'Add at least one child.'),
  })
  @ArrayMaxSize(MAX_FAMILY_CHILDREN, {
    message: msg(
      `Un envoi porte ${MAX_FAMILY_CHILDREN} enfants au plus : faites-en un second pour les autres.`,
      `One submission holds at most ${MAX_FAMILY_CHILDREN} children: make a second one for the others.`,
    ),
  })
  @ValidateNested({ each: true })
  @Type(() => FamilyChildDto)
  enfants!: FamilyChildDto[];
}

export class ValidateFamilyChildDto {
  // Élève choisi par le secrétariat quand le rapprochement n'est pas évident.
  @IsOptional()
  @IsString()
  studentId?: string;

  // « J'ai vu les alertes » : remplace les valeurs déjà enregistrées et accepte un responsable de plus.
  @IsOptional()
  @IsBoolean()
  confirmer?: boolean;
}

export class RefuseFamilyChildDto {
  @IsString()
  @MinLength(3, {
    message: msg(
      'Indiquez le motif (3 caractères au moins).',
      'Enter the reason (at least 3 characters).',
    ),
  })
  @MaxLength(300)
  motif!: string;
}

export class UpdateCollectLinkDto {
  // Fermer ou rouvrir le lien.
  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  // Repousse l'échéance sans changer le lien déjà posté dans le groupe.
  @IsOptional()
  @IsBoolean()
  prolonger?: boolean;
}

export class CreateCollectLinkDto {
  // Remplace le lien : l'ancien cesse de fonctionner (à n'utiliser qu'en cas d'abus).
  @IsOptional()
  @IsBoolean()
  regenerer?: boolean;
}

export class ListFamilySubmissionsQueryDto {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsIn(['EN_ATTENTE', 'TRAITEES'])
  statut?: 'EN_ATTENTE' | 'TRAITEES';
}

export class AnalyseFamilyChildQueryDto {
  @IsOptional()
  @IsString()
  studentId?: string;
}

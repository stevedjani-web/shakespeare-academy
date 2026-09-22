import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ActivateDto {
  @IsString()
  @MinLength(6)
  telephone!: string;

  @IsString()
  @MinLength(6)
  code!: string;

  @IsString()
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères.',
  })
  @MaxLength(100)
  motDePasse!: string;

  // Le responsable a lu et accepté la politique de confidentialité (D76).
  @IsBoolean()
  consentement!: boolean;

  // Version de la politique affichée : refusée si ce n'est plus la version en vigueur.
  @IsString()
  versionPolitique!: string;
}

export class ParentLoginDto {
  @IsString()
  @MinLength(6)
  telephone!: string;

  @IsString()
  @MinLength(1)
  motDePasse!: string;
}

export class ParentChangePasswordDto {
  @IsString()
  ancienMotDePasse!: string;

  @IsString()
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères.',
  })
  @MaxLength(100)
  nouveauMotDePasse!: string;
}

export class SetLinkAccessDto {
  @IsBoolean()
  acces!: boolean;

  // Toujours demandé : retirer ou rétablir l'accès d'un responsable est une décision qui doit rester justifiée.
  @IsString()
  @MinLength(1, { message: 'Le motif est obligatoire.' })
  motif!: string;
}

export class WeekQueryDto {
  @IsOptional()
  @Matches(DATE, { message: 'date doit être au format AAAA-MM-JJ.' })
  date?: string;
}

/** Génération de codes d'activation en lot (Lot 18). */
export class BulkCodesDto {
  // Vide = toute l'école (plafonnée).
  @IsOptional()
  @IsString()
  classId?: string;

  // Inclure aussi les responsables qui ont déjà un code valable (leur ancien code est alors annulé).
  @IsOptional()
  @IsBoolean()
  regenerer?: boolean;

  // Durée de validité en jours ; à défaut, le réglage de l'école.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  validiteJours?: number;
}

export class ListParentAccountsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsIn(['SANS_COMPTE', 'CODE_EN_ATTENTE', 'ACTIF'])
  etat?: 'SANS_COMPTE' | 'CODE_EN_ATTENTE' | 'ACTIF';
}

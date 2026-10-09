import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  MaxLength,
  Min,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Interrupteur du paiement des frais par les parents (Lot 17). Faux tant que l'Administrateur ne l'active pas.
  @IsOptional()
  @IsBoolean()
  paiementEnLigneActif?: boolean;

  // Frais de service ajoutés au paiement en ligne d'un parent, en pourcentage du montant (2 = 2 %, 0 = aucun frais).
  // Réservé au droit ONLINE_FEE_MANAGE : le service refuse (403) tout autre compte, même avec SETTINGS_MANAGE.
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Le taux doit être un nombre avec au plus deux décimales.' },
  )
  @Min(0, { message: 'Le taux ne peut pas être négatif.' })
  @Max(10, { message: 'Le taux ne peut pas dépasser 10 %.' })
  fraisServicePourcent?: number;

  // Durée de validité d'un code d'activation de compte parent, en jours (Lot 18).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  parentCodeValiditeJours?: number;

  // Documents officiels (Lot 19) : signataire et ville figurant sur une attestation.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  directeurNom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  directeurTitre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ville?: string;
}

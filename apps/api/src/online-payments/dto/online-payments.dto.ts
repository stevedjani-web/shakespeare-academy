import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const NUMERO_INVALIDE =
  'Numéro invalide. Saisissez un numéro Mobile Money à 9 chiffres (par exemple 06 123 45 67).';

export class InitiateOnlinePaymentDto {
  // Identifiant de la tranche donné par le portail (jamais un identifiant interne de facturation exposé tel quel).
  @IsString({ message: 'Tranche invalide.' })
  trancheId!: string;

  // Montant entier en XAF, pour tout ou partie du solde de la tranche.
  @IsInt({ message: 'Saisissez un montant entier, sans virgule.' })
  @Min(1, { message: 'Le montant doit être supérieur à zéro.' })
  montant!: number;

  // Numéro débité (format local ou international). Le format exact est contrôlé et normalisé par le service, qui
  // renvoie la phrase claire : ici on ne refuse que le vide et l'énorme.
  @IsString({ message: NUMERO_INVALIDE })
  @MinLength(1, { message: NUMERO_INVALIDE })
  @MaxLength(25, { message: NUMERO_INVALIDE })
  telephone!: string;
}

export class ResolveOnlinePaymentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motif!: string;
}

export class ListOnlinePaymentsQueryDto {
  @IsOptional()
  @IsIn(['EN_ATTENTE', 'CONFIRME', 'ECHOUE', 'A_TRAITER'])
  statut?: 'EN_ATTENTE' | 'CONFIRME' | 'ECHOUE' | 'A_TRAITER';
}

import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class InitiateOnlinePaymentDto {
  @IsString()
  // Identifiant de la tranche donné par le portail (jamais un identifiant interne de facturation exposé tel quel).
  trancheId!: string;

  // Montant entier en XAF, pour tout ou partie du solde de la tranche.
  @IsInt()
  @Min(1)
  montant!: number;

  // Numéro débité (format local ou international, normalisé côté serveur).
  @IsString()
  @MinLength(6)
  @MaxLength(25)
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

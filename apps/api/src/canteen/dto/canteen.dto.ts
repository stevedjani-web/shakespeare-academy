import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export const CANTEEN_MAX_DAYS_PER_SALE = 120;

export class SellCanteenDto {
  // Jours à payer, "AAAA-MM-JJ" : le serveur contrôle chacun (jour de cantine, ouvert, pas déjà payé).
  @IsArray()
  @ArrayMinSize(1, { message: 'Choisissez au moins un jour.' })
  @ArrayMaxSize(CANTEEN_MAX_DAYS_PER_SALE, {
    message: `Au plus ${CANTEEN_MAX_DAYS_PER_SALE} jours par vente.`,
  })
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    each: true,
    message: 'Chaque jour doit être au format AAAA-MM-JJ.',
  })
  dates!: string[];

  // Le total vu à l'écran : s'il diffère du total recalculé (prix changé entre-temps), rien n'est encaissé (409).
  @IsInt()
  @Min(1)
  totalAttendu!: number;

  @IsIn(['ESPECES', 'MOBILE_MONEY'], {
    message: 'Mode de paiement accepté : espèces ou Mobile Money.',
  })
  modePaiement!: 'ESPECES' | 'MOBILE_MONEY';

  // Obligatoire pour Mobile Money (numéro de transaction).
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceExterne?: string;
}

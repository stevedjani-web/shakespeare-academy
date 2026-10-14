import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaymentMode } from '@prisma/client';

// Au guichet : espèces ou Mobile Money seulement. Virement, dépôt et chèque passent par une déclaration avec preuve
// (`/bank-payments`), jamais par un encaissement direct sans contrôle du relevé.
const COUNTER_MODES: PaymentMode[] = ['ESPECES', 'MOBILE_MONEY'];

export class CreatePaymentDto {
  @IsString()
  invoiceLineId!: string;

  @IsInt()
  @Min(1)
  montant!: number;

  @IsOptional()
  @IsIn(COUNTER_MODES)
  modePaiement?: PaymentMode;

  // Requise seulement pour MOBILE_MONEY (enregistrement manuel avec référence externe — cahier
  // §11, déjà tranché : jamais une intégration API automatisée).
  @ValidateIf((dto: CreatePaymentDto) => dto.modePaiement === 'MOBILE_MONEY')
  @IsString()
  @MinLength(1)
  referenceExterne?: string;

  // Encaissement saisi sans Internet (D49) : numéro du reçu provisoire remis au parent et instant réel
  // de la saisie. Les deux vont ensemble — une date de saisie seule est refusée (jamais un moyen
  // d'antidater un paiement en ligne).
  @IsOptional()
  @IsString()
  @Matches(/^PROV-[A-Z0-9]{4,10}-\d{6}-\d{1,6}$/, {
    message: 'numeroProvisoire invalide.',
  })
  numeroProvisoire?: string;

  @IsOptional()
  @IsDateString()
  dateSaisie?: string;
}

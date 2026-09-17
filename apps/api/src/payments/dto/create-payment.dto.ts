import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';
import { PaymentMode } from '@prisma/client';

export class CreatePaymentDto {
  @IsString()
  invoiceLineId!: string;

  @IsInt()
  @Min(1)
  montant!: number;

  @IsOptional()
  @IsEnum(PaymentMode)
  modePaiement?: PaymentMode;

  // Requise seulement pour MOBILE_MONEY (enregistrement manuel avec référence externe — cahier
  // §11, déjà tranché : jamais une intégration API automatisée).
  @ValidateIf((dto: CreatePaymentDto) => dto.modePaiement === 'MOBILE_MONEY')
  @IsString()
  @MinLength(1)
  referenceExterne?: string;
}

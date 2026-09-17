import { IsEnum, IsInt, IsString, Min, MinLength } from 'class-validator';
import { DiscountType } from '@prisma/client';

export class CreateDiscountDto {
  @IsString()
  invoiceLineId!: string;

  @IsEnum(DiscountType)
  type!: DiscountType;

  // MONTANT_FIXE : un montant XAF entier. POURCENTAGE : un entier 1-100 (validé dans le service,
  // dépend de la ligne de facture ciblée pour le plafonnement, hors de portée d'un simple DTO).
  @IsInt()
  @Min(1)
  valeur!: number;

  @IsString()
  @MinLength(1)
  motif!: string;
}

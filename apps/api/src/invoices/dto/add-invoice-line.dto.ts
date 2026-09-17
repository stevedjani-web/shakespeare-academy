import { IsInt, IsString, Min } from 'class-validator';

export class AddInvoiceLineDto {
  @IsString()
  feeTypeId!: string;

  @IsInt()
  @Min(1)
  montant!: number;
}

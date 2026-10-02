import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const EXPENSE_PAYMENT_MODES = [
  'ESPECES',
  'VIREMENT',
  'CHEQUE',
  'MOBILE_MONEY',
] as const;
export type ExpensePaymentModeValue = (typeof EXPENSE_PAYMENT_MODES)[number];

/** Corps de `POST /expenses/:id/disburse` (champ `payload` d'un envoi multipart, avec la preuve en fichier joint). */
export class DisburseExpenseDto {
  @IsIn(EXPENSE_PAYMENT_MODES)
  modePaiement!: ExpensePaymentModeValue;

  // Obligatoire sauf en espèces (virement, chèque, Mobile Money) : contrôlé par le service.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

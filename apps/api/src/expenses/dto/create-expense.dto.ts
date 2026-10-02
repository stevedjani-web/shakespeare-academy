import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from '../expense-categories';

/** Corps de `POST /expenses` (champ `payload` d'un envoi multipart, avec les justificatifs en fichiers joints). */
export class CreateExpenseDto {
  @IsIn(EXPENSE_CATEGORIES)
  categorie!: ExpenseCategory;

  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  montant!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  beneficiaire?: string;

  @IsOptional()
  @IsDateString()
  dateDepense?: string;
}

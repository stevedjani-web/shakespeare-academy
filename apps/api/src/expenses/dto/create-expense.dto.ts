import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../expense-categories';

export class CreateExpenseDto {
  @IsIn(EXPENSE_CATEGORIES)
  categorie!: ExpenseCategory;

  @IsInt()
  @Min(1)
  montant!: number;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsString()
  dateDepense?: string;
}

import { IsString, MinLength } from 'class-validator';

export class CancelExpenseDto {
  @IsString()
  @MinLength(3)
  motif!: string;
}

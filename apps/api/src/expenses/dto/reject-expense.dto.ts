import { IsString, MinLength } from 'class-validator';

export class RejectExpenseDto {
  @IsString()
  @MinLength(1)
  motif!: string;
}

import { IsString, MinLength } from 'class-validator';

export class RejectBankDepositDto {
  @IsString()
  @MinLength(3)
  motif!: string;
}

import { IsString, MinLength } from 'class-validator';

export class CancelPaymentDto {
  @IsString()
  @MinLength(1)
  motif!: string;
}

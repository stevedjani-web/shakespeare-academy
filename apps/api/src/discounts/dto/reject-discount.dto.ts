import { IsString, MinLength } from 'class-validator';

export class RejectDiscountDto {
  @IsString()
  @MinLength(1)
  motifRejet!: string;
}

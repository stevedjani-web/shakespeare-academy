import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { InstallmentDto } from './installment.dto';

// Exactement l'un des deux selon FeeType.avecTranches (vérifié dans le service, pas ici :
// dépend d'une lecture en base, hors de portée d'un simple validateur de DTO) :
// - avecTranches=false : `montant` requis, `installments` absent.
// - avecTranches=true  : `installments` requis (le total est implicitement leur somme), `montant` absent.
export class CreateFeeScheduleDto {
  @IsString()
  academicYearId!: string;

  @IsString()
  levelId!: string;

  @IsString()
  feeTypeId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  montant?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InstallmentDto)
  installments?: InstallmentDto[];
}

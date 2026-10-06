import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Corps de `POST /bank-deposits` (champ `payload` d'un envoi multipart, le bordereau est le fichier `bordereau`). */
export class CreateBankDepositDto {
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  montant!: number;

  // Jour inscrit sur le bordereau, au format AAAA-MM-JJ.
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateVersement!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  banque!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  numeroBordereau!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { msg } from '../../common/language';

export const BANK_METHODS = ['VIREMENT', 'DEPOT_BANCAIRE', 'CHEQUE'] as const;
export type BankMethod = (typeof BANK_METHODS)[number];

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const dateMessage = msg(
  'Indiquez la date au format AAAA-MM-JJ.',
  'Enter the date as YYYY-MM-DD.',
);
const motifMessage = msg(
  'Indiquez un motif (3 caractères au moins).',
  'Give a reason (at least 3 characters).',
);

/** Une tranche couverte par la déclaration et la part de la preuve qui lui revient. */
export class ClaimLineDto {
  @IsString({ message: msg('Tranche invalide.', 'Invalid instalment.') })
  trancheId!: string;

  @IsInt({
    message: msg(
      'Saisissez un montant entier, sans virgule.',
      'Enter a whole amount, without decimals.',
    ),
  })
  @Min(1, {
    message: msg(
      'Chaque montant doit être supérieur à zéro.',
      'Each amount must be greater than zero.',
    ),
  })
  @Max(1_000_000_000)
  montant!: number;
}

/**
 * Déclaration d'un paiement par banque. Une preuve peut couvrir plusieurs tranches, et plusieurs enfants d'une même
 * famille : la somme des lignes est le montant déclaré (contrôlé par le service).
 */
export class DeclareBankPaymentDto {
  @IsIn(BANK_METHODS, {
    message: msg(
      'Choisissez virement, dépôt en banque ou chèque.',
      'Choose transfer, bank deposit or cheque.',
    ),
  })
  methode!: BankMethod;

  @IsInt({
    message: msg(
      'Saisissez un montant entier, sans virgule.',
      'Enter a whole amount, without decimals.',
    ),
  })
  @Min(1, {
    message: msg(
      'Le montant doit être supérieur à zéro.',
      'The amount must be greater than zero.',
    ),
  })
  @Max(1_000_000_000)
  montant!: number;

  // Banque de l'opération : celle qui figure sur la preuve (pour un chèque, la banque de l'émetteur).
  @IsString({ message: msg('Indiquez la banque.', 'Enter the bank.') })
  @MinLength(2, { message: msg('Indiquez la banque.', 'Enter the bank.') })
  @MaxLength(80)
  banque!: string;

  // Compte de l'école crédité (liste donnée aux parents). Facultatif pour un chèque remis à l'école.
  @IsOptional()
  @IsString()
  compteId?: string;

  // Numéro de l'opération (virement), du bordereau (dépôt) ou du chèque : une même opération ne sert jamais deux fois.
  @IsString({
    message: msg(
      "Indiquez la référence de l'opération.",
      'Enter the operation reference.',
    ),
  })
  @MinLength(2, {
    message: msg(
      "Indiquez la référence de l'opération.",
      'Enter the operation reference.',
    ),
  })
  @MaxLength(60)
  referenceOperation!: string;

  @Matches(DATE_ISO, { message: dateMessage })
  dateOperation!: string;

  // Nom de la personne qui a déposé ou émis le chèque.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payeur?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsArray({
    message: msg(
      'Choisissez au moins une tranche.',
      'Choose at least one instalment.',
    ),
  })
  @ArrayMinSize(1, {
    message: msg(
      'Choisissez au moins une tranche.',
      'Choose at least one instalment.',
    ),
  })
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ClaimLineDto)
  lignes!: ClaimLineDto[];
}

/** Déclaration faite par le secrétariat pour une famille (chèque remis à l'école, preuve apportée en main propre). */
export class StaffDeclareBankPaymentDto extends DeclareBankPaymentDto {
  // Responsable concerné, quand on le connaît : il verra la déclaration dans son espace.
  @IsOptional()
  @IsString()
  guardianId?: string;
}

/** Confirmation par le Promoteur : le crédit figure sur le relevé de la banque. */
export class ConfirmBankPaymentDto {
  @IsInt({
    message: msg(
      'Saisissez le montant crédité, entier.',
      'Enter the credited amount, as a whole number.',
    ),
  })
  @Min(1)
  @Max(1_000_000_000)
  montantCredite!: number;

  @Matches(DATE_ISO, { message: dateMessage })
  dateCredit!: string;

  // Référence de la ligne du relevé de la banque.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceReleve?: string;
}

export class AllocationDto {
  @IsString()
  trancheId!: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  montant!: number;
}

/** Validation par le secrétariat : crée les paiements et leurs reçus, une tranche à la fois (D41). */
export class ValidateBankPaymentDto {
  // Par défaut, les montants déclarés. Elles peuvent être abaissées si une tranche a été payée entre-temps.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];

  // Obligatoire quand une part du crédit n'est pas imputée (remboursement hors application).
  @IsOptional()
  @IsString()
  @MinLength(3, { message: motifMessage })
  @MaxLength(300)
  motifExcedent?: string;
}

export class RejectBankPaymentDto {
  @IsString({ message: motifMessage })
  @MinLength(3, { message: motifMessage })
  @MaxLength(500)
  motif!: string;
}

export class ResolveSurplusDto {
  @IsString({ message: motifMessage })
  @MinLength(3, { message: motifMessage })
  @MaxLength(300)
  motif!: string;
}

export class SchoolBankAccountDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  banque!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  titulaire!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(80)
  numero!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class UpdateSchoolBankAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  banque?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  titulaire?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  numero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

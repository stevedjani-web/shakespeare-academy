import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { msg } from '../../common/language';

/** Consigne facultative du membre du personnel pour orienter le brouillon (« dis que le cours est reporté »). */
export class SuggestReplyDto {
  @IsOptional()
  @IsString()
  @MaxLength(400, {
    message: msg(
      'La consigne est limitée à 400 caractères.',
      'The instruction is limited to 400 characters.',
    ),
  })
  consigne?: string;
}

export class UpdateAssistantSettingsDto {
  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  // En centimes de dollar : 1000 = 10 $. Jusqu'à 500 $ par mois.
  @IsOptional()
  @IsInt()
  @Min(0, {
    message: msg(
      'Le plafond ne peut pas être négatif.',
      'The limit cannot be negative.',
    ),
  })
  @Max(50000, {
    message: msg(
      'Le plafond est limité à 500 $ par mois.',
      'The limit is capped at $500 per month.',
    ),
  })
  plafondMensuelCentimes?: number;

  // `null` (ou une chaîne vide) efface la FAQ.
  @IsOptional()
  @IsString()
  @MaxLength(4000, {
    message: msg(
      'La FAQ est limitée à 4 000 caractères.',
      'The FAQ is limited to 4,000 characters.',
    ),
  })
  faq?: string | null;
}

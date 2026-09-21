import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const TYPES = [
  'ABSENCE',
  'RETARD',
  'ENSEIGNANT_ABSENT',
  'EMPLOI_DU_TEMPS_MODIFIE',
] as const;

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}

export class PreferenceItemDto {
  @IsEnum(TYPES)
  type!: (typeof TYPES)[number];

  @IsBoolean()
  push!: boolean;
}

export class SetPreferencesDto {
  @IsArray()
  @ArrayMaxSize(TYPES.length)
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  preferences!: PreferenceItemDto[];
}

export class PushKeysDto {
  @IsString()
  @MaxLength(300)
  p256dh!: string;

  @IsString()
  @MaxLength(100)
  auth!: string;
}

export class SubscribePushDto {
  // Adresse fournie par le service push du navigateur : toujours en https.
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  endpoint!: string;

  // Sans IsDefined, un champ absent passerait la validation imbriquée et ferait échouer la requête en 500.
  @IsDefined()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class UnsubscribePushDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;
}

import { MessagePriority } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { msg } from '../../common/language';
import {
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
} from '../messaging.util';

const TEXT = {
  message: msg(
    'Le message ne peut pas être vide.',
    'The message cannot be empty.',
  ),
};

export class MessageTextDto {
  @IsString()
  @MinLength(1, TEXT)
  @MaxLength(MESSAGE_MAX_LENGTH)
  texte!: string;

  // Facultative : NORMALE par défaut. Un parent ne peut pas choisir URGENTE (refusé par le service).
  @IsOptional()
  @IsEnum(MessagePriority, {
    message: msg(
      'Priorité inconnue (NORMALE, IMPORTANTE ou URGENTE).',
      'Unknown priority (NORMALE, IMPORTANTE or URGENTE).',
    ),
  })
  priorite?: MessagePriority;
}

/** Un responsable écrit à un enseignant de la classe de son enfant, ou à l'école. */
export class ParentNewThreadDto extends MessageTextDto {
  @IsString()
  studentId!: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsBoolean()
  ecole?: boolean;
}

/** Le personnel écrit à un responsable d'un élève. */
export class StaffNewThreadDto extends MessageTextDto {
  @IsString()
  studentId!: string;

  @IsString()
  guardianId!: string;
}

export class ReportMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motif?: string;
}

export class WithdrawDto {
  @IsString()
  @MinLength(1, {
    message: msg('Le motif est obligatoire.', 'A reason is required.'),
  })
  @MaxLength(500)
  motif!: string;
}

export class CreateAnnouncementDto {
  @IsString()
  classId!: string;

  @IsString()
  @MinLength(1, {
    message: msg('Le titre est obligatoire.', 'The title is required.'),
  })
  @MaxLength(ANNOUNCEMENT_TITLE_MAX_LENGTH)
  titre!: string;

  @IsString()
  @MinLength(1, {
    message: msg(
      "Le texte de l'annonce est obligatoire.",
      'The announcement text is required.',
    ),
  })
  @MaxLength(MESSAGE_MAX_LENGTH)
  corps!: string;
}

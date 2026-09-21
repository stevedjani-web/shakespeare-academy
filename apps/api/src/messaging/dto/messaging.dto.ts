import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
} from '../messaging.util';

const TEXT = { message: 'Le message ne peut pas être vide.' };

export class MessageTextDto {
  @IsString()
  @MinLength(1, TEXT)
  @MaxLength(MESSAGE_MAX_LENGTH)
  texte!: string;
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
  @MinLength(1, { message: 'Le motif est obligatoire.' })
  @MaxLength(500)
  motif!: string;
}

export class CreateAnnouncementDto {
  @IsString()
  classId!: string;

  @IsString()
  @MinLength(1, { message: 'Le titre est obligatoire.' })
  @MaxLength(ANNOUNCEMENT_TITLE_MAX_LENGTH)
  titre!: string;

  @IsString()
  @MinLength(1, { message: "Le texte de l'annonce est obligatoire." })
  @MaxLength(MESSAGE_MAX_LENGTH)
  corps!: string;
}

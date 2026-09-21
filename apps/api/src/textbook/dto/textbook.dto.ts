import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 2000 caractères au plus par texte (paramètre proposé, à valider par la Direction). */
export const TEXTBOOK_MAX_LENGTH = 2000;

export class CreateTextbookEntryDto {
  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  // Jour de la séance.
  @Matches(DATE, { message: 'date doit être au format AAAA-MM-JJ.' })
  date!: string;

  // Ce qui a été fait en cours. Au moins un des deux textes est obligatoire.
  @IsOptional()
  @IsString()
  @MaxLength(TEXTBOOK_MAX_LENGTH)
  contenu?: string;

  // Travail à faire à la maison.
  @IsOptional()
  @IsString()
  @MaxLength(TEXTBOOK_MAX_LENGTH)
  devoirs?: string;

  // Pour quand le devoir est à rendre.
  @IsOptional()
  @Matches(DATE, { message: 'dateEcheance doit être au format AAAA-MM-JJ.' })
  dateEcheance?: string;
}

export class UpdateTextbookEntryDto {
  @IsOptional()
  @Matches(DATE, { message: 'date doit être au format AAAA-MM-JJ.' })
  date?: string;

  // Une chaîne vide efface le texte.
  @IsOptional()
  @IsString()
  @MaxLength(TEXTBOOK_MAX_LENGTH)
  contenu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TEXTBOOK_MAX_LENGTH)
  devoirs?: string;

  // Une chaîne vide efface l'échéance.
  @IsOptional()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/, {
    message: 'dateEcheance doit être au format AAAA-MM-JJ.',
  })
  dateEcheance?: string;
}

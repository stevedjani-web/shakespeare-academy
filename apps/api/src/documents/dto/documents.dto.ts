import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class IssueDocumentDto {
  @IsEnum(DocumentType, { message: 'Type de document inconnu.' })
  type!: DocumentType;

  // Crée un nouveau document (nouveau numéro) et annule l'ancien : carte perdue, changement de classe.
  @IsOptional()
  @IsBoolean()
  renouveler?: boolean;
}

export class CancelDocumentDto {
  @IsString()
  @MinLength(3, { message: 'Indiquez le motif de l’annulation (3 caractères au moins).' })
  @MaxLength(300)
  motif!: string;
}

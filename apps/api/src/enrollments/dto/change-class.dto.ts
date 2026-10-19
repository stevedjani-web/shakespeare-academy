import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class ChangeClassDto {
  @IsString()
  classId!: string;

  /** Obligatoire quand la nouvelle classe est d'un autre niveau : la facture change, il faut dire pourquoi. */
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Le motif doit faire au moins 3 caractères.' })
  motif?: string;

  /** Ne change rien : montre seulement ce que le changement ferait (classe, facture, notes et appels concernés). */
  @IsOptional()
  @IsBoolean()
  simuler?: boolean;
}

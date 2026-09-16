import { IsString, Matches, MinLength } from 'class-validator';

export class CreateSectionDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'code doit être en MAJUSCULES_SNAKE_CASE.',
  })
  code!: string;

  @IsString()
  @MinLength(1)
  nom!: string;
}

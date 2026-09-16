import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCycleDto {
  @IsString()
  sectionId!: string;

  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'code doit être en MAJUSCULES_SNAKE_CASE.',
  })
  code!: string;

  @IsString()
  @MinLength(1)
  nom!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordre?: number;
}

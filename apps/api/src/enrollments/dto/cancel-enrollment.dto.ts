import { IsString, MinLength } from 'class-validator';

export class CancelEnrollmentDto {
  @IsString()
  @MinLength(3)
  motif!: string;
}

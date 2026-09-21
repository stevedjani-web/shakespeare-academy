import { IsOptional, IsString, Matches } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PilotageQueryDto {
  @IsOptional()
  @Matches(DATE, { message: 'from doit être au format AAAA-MM-JJ.' })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'to doit être au format AAAA-MM-JJ.' })
  to?: string;

  @IsOptional()
  @IsString()
  classId?: string;
}

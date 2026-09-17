import { IsString } from 'class-validator';

export class ChangeClassDto {
  @IsString()
  classId!: string;
}

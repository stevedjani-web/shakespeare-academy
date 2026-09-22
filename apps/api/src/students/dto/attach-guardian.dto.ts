import { IsBoolean, IsOptional } from 'class-validator';
import { CreateGuardianDto } from './create-guardian.dto';

// Rattache un responsable existant (par téléphone, R9-like) ou en crée un nouveau si aucun ne
// correspond dans cet établissement — même logique find-or-create que la création d'élève. Sans
// téléphone (facultatif, voir CreateGuardianDto), toujours un nouveau Guardian : aucun rapprochement
// possible.
export class AttachGuardianDto extends CreateGuardianDto {
  @IsOptional()
  @IsBoolean()
  prioritaire?: boolean;
}

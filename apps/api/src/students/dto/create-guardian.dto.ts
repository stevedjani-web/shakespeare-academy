import { IsOptional, IsString, MinLength } from 'class-validator';

// Tous facultatifs (demande explicite, 22 septembre 2026, même raison que CreateStudentDto.dateNaissance) :
// un responsable incomplet reste enregistrable, à compléter plus tard via PATCH /students/guardians/:id.
// Un champ envoyé reste néanmoins soumis à @MinLength(1) — une chaîne vide est refusée, il faut omettre
// le champ plutôt que d'envoyer "". Sans téléphone, aucun rapprochement avec un responsable déjà connu
// n'est possible (StudentsService.create/attachGuardian créent toujours un nouveau Guardian) et aucun
// code d'activation parent ne peut être généré pour ce responsable (ParentAccountsService.generateCode).
export class CreateGuardianDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  prenom?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  telephone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  profession?: string;

  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lien?: string;
}

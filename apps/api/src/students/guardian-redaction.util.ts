import type { CurrentUserData } from '../auth/types/current-user.interface';

export const GUARDIAN_DETAIL_PERMISSION = 'GUARDIAN_DETAIL_READ';

/** Peut-on lire la fiche complète d'un responsable (e-mail, adresse, profession) ? */
export function canReadGuardianDetails(user: CurrentUserData): boolean {
  return user.permissions.includes(GUARDIAN_DETAIL_PERMISSION);
}

interface GuardianLike {
  email: string | null;
  adresse: string | null;
  profession: string | null;
}

interface WithGuardians<G extends GuardianLike> {
  studentGuardians: Array<{ guardian: G }>;
}

/**
 * Réduit chaque responsable d'un dossier d'élève à ce que voit un compte sans `GUARDIAN_DETAIL_READ` : nom, lien
 * et téléphone. L'e-mail, l'adresse et la profession sont remis à null (la forme de la réponse ne change pas).
 */
export function redactStudentGuardians<
  G extends GuardianLike,
  S extends WithGuardians<G>,
>(student: S, user: CurrentUserData): S {
  if (canReadGuardianDetails(user)) return student;
  return {
    ...student,
    studentGuardians: student.studentGuardians.map((link) => ({
      ...link,
      guardian: {
        ...link.guardian,
        email: null,
        adresse: null,
        profession: null,
      },
    })),
  };
}

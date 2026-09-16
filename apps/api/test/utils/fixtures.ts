import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedReferenceData } from '../../prisma/seed-data';

export const TEST_ADMIN_PASSWORD = 'ChangeMe123!';

/** Établissement + rôles/permissions du Lot 1 + un compte Administrateur, réutilisable dans chaque suite. */
export async function seedBaseFixtures(prisma: PrismaClient) {
  return seedReferenceData(prisma, { adminPassword: TEST_ADMIN_PASSWORD });
}

export async function createUserWithRole(
  prisma: PrismaClient,
  schoolId: string,
  roleCode: string,
  overrides: {
    nom?: string;
    prenom?: string;
    email?: string;
    motDePasse?: string;
  } = {},
) {
  const role = await prisma.role.findUniqueOrThrow({
    where: { code: roleCode },
  });
  const motDePasse = overrides.motDePasse ?? 'MotDePasse123!';
  const motDePasseHash = await argon2.hash(motDePasse, {
    type: argon2.argon2id,
  });

  const user = await prisma.user.create({
    data: {
      schoolId,
      roleId: role.id,
      nom: overrides.nom ?? 'Test',
      prenom: overrides.prenom ?? roleCode,
      email: overrides.email ?? `${roleCode.toLowerCase()}@test.local`,
      motDePasseHash,
      doitChangerMotDePasse: false,
    },
  });

  return { user, motDePasse };
}

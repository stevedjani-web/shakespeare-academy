import { PrismaClient } from '@prisma/client';
import { seedReferenceData } from './seed-data';

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedReferenceData(prisma, {
      adminEmail: process.env.ADMIN_SEED_EMAIL,
      adminPassword: process.env.ADMIN_SEED_PASSWORD,
    });
    // eslint-disable-next-line no-console
    console.log('Référentiel de base créé (établissement, rôles, permissions, compte administrateur).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

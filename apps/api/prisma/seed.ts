import { PrismaClient } from '@prisma/client';
import { seedReferenceData } from './seed-data';

async function main() {
  const prisma = new PrismaClient();
  try {
    // `|| undefined`, jamais juste la valeur brute : docker-compose positionne ces variables à une
    // chaîne vide (${VAR:-}) quand elles sont absentes de .env.production, jamais réellement absentes
    // du process — `?? défaut` dans seedReferenceData ne se déclenche donc pas sur '' (bug réel
    // rencontré en déployant : un premier compte admin a été créé avec un email vide).
    await seedReferenceData(prisma, {
      adminEmail: process.env.ADMIN_SEED_EMAIL || undefined,
      adminPassword: process.env.ADMIN_SEED_PASSWORD || undefined,
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

-- AlterTable
ALTER TABLE "guardians" ALTER COLUMN "nom" DROP NOT NULL,
ALTER COLUMN "prenom" DROP NOT NULL,
ALTER COLUMN "telephone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "student_guardians" ALTER COLUMN "lien" DROP NOT NULL;

-- AlterTable
ALTER TABLE "students" ALTER COLUMN "dateNaissance" DROP NOT NULL;

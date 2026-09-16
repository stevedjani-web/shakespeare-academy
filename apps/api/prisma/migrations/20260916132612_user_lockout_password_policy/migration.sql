-- AlterTable
ALTER TABLE "users" ADD COLUMN     "doitChangerMotDePasse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tentativesEchecsConnexion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verrouilleJusqua" TIMESTAMP(3);

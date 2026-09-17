-- CreateEnum
CREATE TYPE "FeeApplicability" AS ENUM ('TOUS', 'INSCRIPTION', 'REINSCRIPTION');

-- AlterTable
ALTER TABLE "fee_types" ADD COLUMN     "appliesTo" "FeeApplicability" NOT NULL DEFAULT 'TOUS';

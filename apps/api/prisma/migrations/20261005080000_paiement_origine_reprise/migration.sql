-- CreateEnum
CREATE TYPE "PaymentOrigin" AS ENUM ('APPLICATION', 'REPRISE');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "origine" "PaymentOrigin" NOT NULL DEFAULT 'APPLICATION';


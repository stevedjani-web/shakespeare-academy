-- AlterTable
ALTER TABLE "users" ADD COLUMN     "telephone" TEXT,
ADD COLUMN     "telephoneCle" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_schoolId_telephoneCle_key" ON "users"("schoolId", "telephoneCle");


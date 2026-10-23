-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "combinationId" TEXT;

-- AlterTable
ALTER TABLE "levels" ADD COLUMN     "gridId" TEXT;

-- AlterTable
ALTER TABLE "time_slots" ADD COLUMN     "gridId" TEXT;

-- CreateTable
CREATE TABLE "time_grids" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_grids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_combinations" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_combinations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "time_grids_schoolId_nom_key" ON "time_grids"("schoolId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "class_combinations_academicYearId_nom_key" ON "class_combinations"("academicYearId", "nom");

-- AddForeignKey
ALTER TABLE "levels" ADD CONSTRAINT "levels_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES "time_grids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "class_combinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_grids" ADD CONSTRAINT "time_grids_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_combinations" ADD CONSTRAINT "class_combinations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_combinations" ADD CONSTRAINT "class_combinations_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES "time_grids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


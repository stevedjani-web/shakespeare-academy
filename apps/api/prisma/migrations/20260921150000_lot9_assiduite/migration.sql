-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'RETARD', 'ABSENT');

-- CreateEnum
CREATE TYPE "JustificationStatus" AS ENUM ('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "delaiJustificatifJours" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "retardMaxMinutes" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "absence_reasons" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_calls" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "takenById" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saisieHorsLigneAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "statut" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "minutesRetard" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "ancienStatut" "AttendanceStatus" NOT NULL,
    "ancienMinutes" INTEGER,
    "nouveauStatut" "AttendanceStatus" NOT NULL,
    "nouveauMinutes" INTEGER,
    "motif" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_justifications" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "reasonId" TEXT,
    "commentaire" TEXT,
    "statut" "JustificationStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "horsDelai" BOOLEAN NOT NULL DEFAULT false,
    "declaredById" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionCommentaire" TEXT,

    CONSTRAINT "absence_justifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "absence_reasons_libelle_key" ON "absence_reasons"("libelle");

-- CreateIndex
CREATE INDEX "attendance_calls_classId_date_idx" ON "attendance_calls"("classId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_calls_entryId_date_key" ON "attendance_calls"("entryId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_studentId_idx" ON "attendance_records"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_callId_studentId_key" ON "attendance_records"("callId", "studentId");

-- CreateIndex
CREATE INDEX "attendance_corrections_recordId_idx" ON "attendance_corrections"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "absence_justifications_recordId_key" ON "absence_justifications"("recordId");

-- AddForeignKey
ALTER TABLE "attendance_calls" ADD CONSTRAINT "attendance_calls_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "timetable_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_calls" ADD CONSTRAINT "attendance_calls_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_calls" ADD CONSTRAINT "attendance_calls_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_calls" ADD CONSTRAINT "attendance_calls_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_calls" ADD CONSTRAINT "attendance_calls_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_callId_fkey" FOREIGN KEY ("callId") REFERENCES "attendance_calls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_justifications" ADD CONSTRAINT "absence_justifications_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_justifications" ADD CONSTRAINT "absence_justifications_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "absence_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_justifications" ADD CONSTRAINT "absence_justifications_declaredById_fkey" FOREIGN KEY ("declaredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_justifications" ADD CONSTRAINT "absence_justifications_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

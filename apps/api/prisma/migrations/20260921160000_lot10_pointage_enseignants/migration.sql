-- CreateEnum
CREATE TYPE "PointageMode" AS ENUM ('SEANCE', 'JOURNEE');

-- CreateEnum
CREATE TYPE "CheckinStatus" AS ENUM ('EN_ATTENTE', 'VALIDE', 'REJETE');

-- CreateEnum
CREATE TYPE "CheckinSource" AS ENUM ('SCAN', 'MANUEL');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "pointageEcartMinMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "pointageFenetreMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "pointageToleranceMinutes" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "modePointage" "PointageMode" NOT NULL DEFAULT 'SEANCE',
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "pointage_codes" (
    "id" TEXT NOT NULL,
    "roomId" TEXT,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pointage_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_session_checkins" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "classId" TEXT NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "debutAt" TIMESTAMP(3),
    "finAt" TIMESTAMP(3),
    "debutRecuAt" TIMESTAMP(3),
    "finRecuAt" TIMESTAMP(3),
    "retardMinutes" INTEGER,
    "ecartSalle" BOOLEAN NOT NULL DEFAULT false,
    "source" "CheckinSource" NOT NULL DEFAULT 'SCAN',
    "statut" "CheckinStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "motif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_session_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_day_checkins" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "arriveeAt" TIMESTAMP(3),
    "departAt" TIMESTAMP(3),
    "arriveeRecuAt" TIMESTAMP(3),
    "departRecuAt" TIMESTAMP(3),
    "heurePrevue" TEXT,
    "retardMinutes" INTEGER,
    "source" "CheckinSource" NOT NULL DEFAULT 'SCAN',
    "statut" "CheckinStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "motif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_day_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pointage_codes_roomId_key" ON "pointage_codes"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "pointage_codes_token_key" ON "pointage_codes"("token");

-- CreateIndex
CREATE INDEX "teacher_session_checkins_teacherId_date_idx" ON "teacher_session_checkins"("teacherId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_session_checkins_entryId_date_key" ON "teacher_session_checkins"("entryId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_day_checkins_teacherId_date_key" ON "teacher_day_checkins"("teacherId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_userId_key" ON "teachers"("userId");

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pointage_codes" ADD CONSTRAINT "pointage_codes_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_session_checkins" ADD CONSTRAINT "teacher_session_checkins_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_session_checkins" ADD CONSTRAINT "teacher_session_checkins_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "timetable_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_session_checkins" ADD CONSTRAINT "teacher_session_checkins_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_session_checkins" ADD CONSTRAINT "teacher_session_checkins_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_day_checkins" ADD CONSTRAINT "teacher_day_checkins_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_day_checkins" ADD CONSTRAINT "teacher_day_checkins_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


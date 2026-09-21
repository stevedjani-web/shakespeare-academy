-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ABSENCE', 'RETARD', 'ENSEIGNANT_ABSENT', 'EMPLOI_DU_TEMPS_MODIFIE');

-- CreateEnum
CREATE TYPE "PushDelivery" AS ENUM ('EN_ATTENTE', 'ENVOYE', 'ECHEC', 'DESACTIVE', 'AUCUN_APPAREIL', 'GROUPE');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "notifGroupeMinutes" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "parent_notifications" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "jour" DATE NOT NULL,
    "titre" TEXT NOT NULL,
    "corps" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "pushStatut" "PushDelivery" NOT NULL DEFAULT 'EN_ATTENTE',
    "pushErreur" TEXT,
    "luAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_notification_preferences" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "push" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "parent_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_push_subscriptions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parent_notifications_accountId_luAt_createdAt_idx" ON "parent_notifications"("accountId", "luAt", "createdAt");

-- CreateIndex
CREATE INDEX "parent_notifications_accountId_studentId_type_jour_idx" ON "parent_notifications"("accountId", "studentId", "type", "jour");

-- CreateIndex
CREATE UNIQUE INDEX "parent_notification_preferences_accountId_type_key" ON "parent_notification_preferences"("accountId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "parent_push_subscriptions_endpoint_key" ON "parent_push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "parent_push_subscriptions_accountId_idx" ON "parent_push_subscriptions"("accountId");

-- AddForeignKey
ALTER TABLE "parent_notifications" ADD CONSTRAINT "parent_notifications_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_notifications" ADD CONSTRAINT "parent_notifications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_notification_preferences" ADD CONSTRAINT "parent_notification_preferences_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_push_subscriptions" ADD CONSTRAINT "parent_push_subscriptions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


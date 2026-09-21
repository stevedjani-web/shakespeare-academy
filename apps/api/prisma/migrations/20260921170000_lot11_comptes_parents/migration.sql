-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "parentCodeValiditeJours" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "student_guardians" ADD COLUMN     "accesModifieAt" TIMESTAMP(3),
ADD COLUMN     "accesMotif" TEXT,
ADD COLUMN     "accesPortail" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "parent_accounts" (
    "id" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "statut" "UserStatus" NOT NULL DEFAULT 'ACTIF',
    "tentativesEchecsConnexion" INTEGER NOT NULL DEFAULT 0,
    "verrouilleJusqua" TIMESTAMP(3),
    "dernierLoginAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_refresh_tokens" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_consents" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_activation_codes" (
    "id" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_activation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parent_accounts_guardianId_key" ON "parent_accounts"("guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "parent_refresh_tokens_tokenHash_key" ON "parent_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "parent_refresh_tokens_accountId_idx" ON "parent_refresh_tokens"("accountId");

-- CreateIndex
CREATE INDEX "parent_consents_accountId_idx" ON "parent_consents"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "parent_activation_codes_codeHash_key" ON "parent_activation_codes"("codeHash");

-- CreateIndex
CREATE INDEX "parent_activation_codes_guardianId_idx" ON "parent_activation_codes"("guardianId");

-- AddForeignKey
ALTER TABLE "parent_accounts" ADD CONSTRAINT "parent_accounts_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_refresh_tokens" ADD CONSTRAINT "parent_refresh_tokens_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_consents" ADD CONSTRAINT "parent_consents_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_activation_codes" ADD CONSTRAINT "parent_activation_codes_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_activation_codes" ADD CONSTRAINT "parent_activation_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


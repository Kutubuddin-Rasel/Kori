/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `transactions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `idempotencyKey` to the `transactions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "wallets" DROP CONSTRAINT "wallets_userId_fkey";

-- DropIndex
DROP INDEX "ledger_entries_createdAt_idx";

-- DropIndex
DROP INDEX "ledger_entries_walletId_idx";

-- AlterTable
ALTER TABLE "ledger_entries" ALTER COLUMN "amount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "idempotencyKey" UUID NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "trusted_devices" ALTER COLUMN "refreshTokenHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "balance" SET DATA TYPE BIGINT,
ALTER COLUMN "currency" SET DEFAULT 'BDT';

-- CreateIndex
CREATE INDEX "ledger_entries_walletId_createdAt_idx" ON "ledger_entries"("walletId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotencyKey_key" ON "transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "transactions_idempotencyKey_idx" ON "transactions"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

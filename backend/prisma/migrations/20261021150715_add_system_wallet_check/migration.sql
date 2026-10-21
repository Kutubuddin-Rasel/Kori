/*
  Warnings:

  - A unique constraint covering the columns `[type]` on the table `wallets` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "wallets_one_system_wallet_key";

-- CreateIndex
CREATE UNIQUE INDEX "wallets_one_system_wallet_key" ON "wallets"("type") WHERE ("type" = 'SYSTEM');

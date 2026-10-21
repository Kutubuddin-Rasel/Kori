/*
  Warnings:

  - A unique constraint covering the columns `[type]` on the table `wallets` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "wallets_one_system_wallet_key" ON "wallets"("type") WHERE ("type" = 'SYSTEM');

ALTER TABLE "wallets" 
ADD CONSTRAINT "system_wallet_state_check"
CHECK(
  "type" <> 'SYSTEM'::"WalletType"
  OR(
    "currency" = 'BDT'
    AND "isActive" = TRUE
    AND "userId" IS NULL 
  )
)
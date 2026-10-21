-- Fix any system wallet that was set to inactive before adding constraint
UPDATE "wallets" SET "isActive" = TRUE WHERE "type" = 'SYSTEM';

-- Re-add check constraint dropped when currency column was recreated
ALTER TABLE "wallets" 
ADD CONSTRAINT "system_wallet_state_check"
CHECK(
  "type" <> 'SYSTEM'::"WalletType"
  OR(
    "currency" = 'BDT'::"Currency"
    AND "isActive" = TRUE
    AND "userId" IS NULL 
  )
);

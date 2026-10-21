/*
  Warnings:

  - The `currency` column on the `wallets` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[type]` on the table `wallets` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('BDT');

-- DropIndex
DROP INDEX "wallets_one_system_wallet_key";

-- AlterTable
ALTER TABLE "wallets" DROP COLUMN "currency",
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'BDT';

-- CreateIndex
CREATE UNIQUE INDEX "wallets_one_system_wallet_key" ON "wallets"("type") WHERE ("type" = 'SYSTEM');

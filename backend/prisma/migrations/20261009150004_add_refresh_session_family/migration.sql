/*
  Warnings:

  - You are about to drop the column `refreshTokenHash` on the `trusted_devices` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "trusted_devices" DROP COLUMN "refreshTokenHash",
ADD COLUMN     "currentRefreshJti" UUID,
ADD COLUMN     "refreshSessionId" UUID;

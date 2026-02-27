/*
  Warnings:

  - Added the required column `refreshTokenHash` to the `trusted_devices` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "trusted_devices" ADD COLUMN     "refreshTokenHash" TEXT NOT NULL;

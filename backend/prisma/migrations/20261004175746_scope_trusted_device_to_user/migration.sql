/*
  Warnings:

  - A unique constraint covering the columns `[userId,deviceId]` on the table `trusted_devices` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "trusted_devices_deviceId_key";

-- DropIndex
DROP INDEX "trusted_devices_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "trusted_devices_userId_deviceId_key" ON "trusted_devices"("userId", "deviceId");

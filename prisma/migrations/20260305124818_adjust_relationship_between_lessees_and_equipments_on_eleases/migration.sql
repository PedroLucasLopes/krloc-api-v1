/*
  Warnings:

  - You are about to drop the column `equipmentId` on the `ELease` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[lesseeId]` on the table `ELease` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "ELease" DROP CONSTRAINT "ELease_equipmentId_fkey";

-- AlterTable
ALTER TABLE "ELease" DROP COLUMN "equipmentId";

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "eleaseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ELease_lesseeId_key" ON "ELease"("lesseeId");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_eleaseId_fkey" FOREIGN KEY ("eleaseId") REFERENCES "ELease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

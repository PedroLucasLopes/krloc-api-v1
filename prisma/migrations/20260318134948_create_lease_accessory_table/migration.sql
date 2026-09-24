/*
  Warnings:

  - You are about to drop the column `equipmentId` on the `Accessory` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Accessory" DROP CONSTRAINT "Accessory_equipmentId_fkey";

-- AlterTable
ALTER TABLE "Accessory" DROP COLUMN "equipmentId";

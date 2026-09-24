/*
  Warnings:

  - You are about to drop the column `leaseItemId` on the `ELease` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ELease" DROP CONSTRAINT "ELease_leaseItemId_fkey";

-- AlterTable
ALTER TABLE "ELease" DROP COLUMN "leaseItemId";

-- AddForeignKey
ALTER TABLE "LeaseItem" ADD CONSTRAINT "LeaseItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ELease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

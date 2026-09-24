-- DropForeignKey
ALTER TABLE "LeaseItem" DROP CONSTRAINT "LeaseItem_contractId_fkey";

-- DropIndex
DROP INDEX "LeaseItem_contractId_key";

-- AlterTable
ALTER TABLE "ELease" ADD COLUMN     "leaseItemId" TEXT;

-- AddForeignKey
ALTER TABLE "ELease" ADD CONSTRAINT "ELease_leaseItemId_fkey" FOREIGN KEY ("leaseItemId") REFERENCES "LeaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

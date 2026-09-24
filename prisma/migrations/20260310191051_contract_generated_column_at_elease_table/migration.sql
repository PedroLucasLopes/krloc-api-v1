/*
  Warnings:

  - You are about to drop the column `contract_generated` on the `LeaseItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ELease" ADD COLUMN     "contract_generated" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LeaseItem" DROP COLUMN "contract_generated";

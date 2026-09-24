-- AlterEnum
ALTER TYPE "StatusEquipment" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "ELease" ALTER COLUMN "finishDate" DROP NOT NULL;

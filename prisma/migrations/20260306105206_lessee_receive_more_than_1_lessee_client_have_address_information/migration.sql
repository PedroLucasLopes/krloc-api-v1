/*
  Warnings:

  - Added the required column `address` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `city` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `zipcode` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Made the column `city` on table `Lessee` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "ELease_lesseeId_key";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "city" TEXT NOT NULL,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "number" INTEGER,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "zipcode" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Lessee" ADD COLUMN     "number" INTEGER,
ALTER COLUMN "city" SET NOT NULL;

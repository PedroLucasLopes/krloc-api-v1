/*
  Warnings:

  - A unique constraint covering the columns `[suffix]` on the table `Equipment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `suffix` to the `Equipment` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Equipment_code_key";

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "suffix" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_suffix_key" ON "Equipment"("suffix");

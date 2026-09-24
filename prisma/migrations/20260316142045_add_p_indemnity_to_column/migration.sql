/*
  Warnings:

  - Added the required column `p_indemnity` to the `Accessory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Accessory" ADD COLUMN     "p_indemnity" DOUBLE PRECISION NOT NULL;

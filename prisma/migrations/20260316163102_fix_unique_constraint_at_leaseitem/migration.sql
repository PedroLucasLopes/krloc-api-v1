/*
  Warnings:

  - A unique constraint covering the columns `[contractId,equipmentId]` on the table `LeaseItem` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "LeaseItem_contractId_equipmentId_key" ON "LeaseItem"("contractId", "equipmentId");

/*
  Warnings:

  - A unique constraint covering the columns `[contractId]` on the table `LeaseItem` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "LeaseItem_contractId_equipmentId_key";

-- AlterTable
ALTER TABLE "LeaseItem" ADD COLUMN     "finantialReportId" TEXT;

-- CreateTable
CREATE TABLE "Accessory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "equipmentId" TEXT,

    CONSTRAINT "Accessory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentAccessory" (
    "equipmentId" TEXT NOT NULL,
    "accessoryId" TEXT NOT NULL,

    CONSTRAINT "EquipmentAccessory_pkey" PRIMARY KEY ("equipmentId","accessoryId")
);

-- CreateIndex
CREATE INDEX "EquipmentAccessory_equipmentId_idx" ON "EquipmentAccessory"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentAccessory_accessoryId_idx" ON "EquipmentAccessory"("accessoryId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseItem_contractId_key" ON "LeaseItem"("contractId");

-- AddForeignKey
ALTER TABLE "Accessory" ADD CONSTRAINT "Accessory_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAccessory" ADD CONSTRAINT "EquipmentAccessory_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAccessory" ADD CONSTRAINT "EquipmentAccessory_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

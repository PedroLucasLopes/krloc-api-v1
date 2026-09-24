-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CONTRACT_CREATED', 'CONTRACT_STARTED', 'CONTRACT_CANCELLED', 'CONTRACT_COMPLETED', 'EQUIPMENT_ADDED', 'EQUIPMENT_REMOVED', 'EQUIPMENT_STATUS_CHANGED');

-- CreateTable
CREATE TABLE "LeaseItem" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "equipmentName" TEXT NOT NULL,
    "equipmentCode" TEXT NOT NULL,
    "equipmentSuffix" INTEGER NOT NULL,
    "p_diary" DOUBLE PRECISION NOT NULL,
    "p_weekly" DOUBLE PRECISION,
    "p_biweekly" DOUBLE PRECISION,
    "p_monthly" DOUBLE PRECISION,
    "p_indemnity" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "finishDate" TIMESTAMP(3),
    "startStatus" "StatusEquipment" NOT NULL,
    "finalStatus" "StatusEquipment",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaseItem_contractId_idx" ON "LeaseItem"("contractId");

-- CreateIndex
CREATE INDEX "LeaseItem_equipmentId_idx" ON "LeaseItem"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseItem_contractId_equipmentId_key" ON "LeaseItem"("contractId", "equipmentId");

-- CreateIndex
CREATE INDEX "AuditLog_contractId_idx" ON "AuditLog"("contractId");

-- CreateIndex
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status");

-- CreateIndex
CREATE INDEX "Equipment_eleaseId_idx" ON "Equipment"("eleaseId");

-- AddForeignKey
ALTER TABLE "LeaseItem" ADD CONSTRAINT "LeaseItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ELease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseItem" ADD CONSTRAINT "LeaseItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ELease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

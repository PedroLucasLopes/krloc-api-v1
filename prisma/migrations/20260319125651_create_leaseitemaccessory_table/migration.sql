-- CreateTable
CREATE TABLE "LeaseItemAccessory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "p_indemnity" DOUBLE PRECISION NOT NULL,
    "accessoryId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,

    CONSTRAINT "LeaseItemAccessory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaseItemAccessory_accessoryId_idx" ON "LeaseItemAccessory"("accessoryId");

-- AddForeignKey
ALTER TABLE "LeaseItemAccessory" ADD CONSTRAINT "LeaseItemAccessory_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ELease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseItemAccessory" ADD CONSTRAINT "LeaseItemAccessory_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

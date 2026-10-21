-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('CONTRACT', 'REPORT');

-- AlterTable
ALTER TABLE "ELease" ADD COLUMN     "documentTemplateId" TEXT;

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "issuer" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_kind_version_key" ON "DocumentTemplate"("kind", "version");

-- AddForeignKey
ALTER TABLE "ELease" ADD CONSTRAINT "ELease_documentTemplateId_fkey" FOREIGN KEY ("documentTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;


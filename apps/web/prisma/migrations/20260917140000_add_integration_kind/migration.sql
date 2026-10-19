-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('BOOKING_ENGINE', 'PAYMENT_GATEWAY');

-- AlterTable
ALTER TABLE "IntegrationConfig" ADD COLUMN     "kind" "IntegrationKind" NOT NULL DEFAULT 'BOOKING_ENGINE',
ADD COLUMN     "updatedById" TEXT;

-- CreateIndex
CREATE INDEX "IntegrationConfig_kind_idx" ON "IntegrationConfig"("kind");
-- Purely additive: two optional columns on DiscountDelivery and a
-- new EmailEvent table for the email Timeline in Logs.

-- AlterTable
ALTER TABLE "DiscountDelivery" ADD COLUMN "fromAddress" TEXT;
ALTER TABLE "DiscountDelivery" ADD COLUMN "providerSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "link" TEXT,
    "bounceType" TEXT,
    "bounceSubType" TEXT,
    "reason" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailEvent_dedupeKey_key" ON "EmailEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailEvent_deliveryId_occurredAt_idx" ON "EmailEvent"("deliveryId", "occurredAt");

-- CreateIndex
CREATE INDEX "EmailEvent_shop_idx" ON "EmailEvent"("shop");

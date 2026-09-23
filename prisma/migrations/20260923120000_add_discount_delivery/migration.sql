-- CreateTable
-- Purely additive. Nothing existing reads or writes this table, so
-- applying it cannot change how any current campaign behaves.
CREATE TABLE "DiscountDelivery" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "providerId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The guard against sending the same person the same coupon twice.
CREATE UNIQUE INDEX "DiscountDelivery_contactId_channel_key"
    ON "DiscountDelivery"("contactId", "channel");

-- CreateIndex
-- The sender polls by shop and status.
CREATE INDEX "DiscountDelivery_shop_status_idx"
    ON "DiscountDelivery"("shop", "status");

-- CreateIndex
-- Reporting reads by shop over a date window.
CREATE INDEX "DiscountDelivery_shop_createdAt_idx"
    ON "DiscountDelivery"("shop", "createdAt");

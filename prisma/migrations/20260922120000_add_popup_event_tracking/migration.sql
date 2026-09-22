-- CreateTable
-- Impressions, submissions and dismissals reported by both widgets.
-- Purely additive: nothing existing reads or writes this table, so
-- applying it cannot change how any current campaign behaves.
CREATE TABLE "PopupEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "popupId" TEXT,
    "type" TEXT NOT NULL,
    "device" TEXT,
    "source" TEXT NOT NULL DEFAULT 'shopify',
    "pageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PopupEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Analytics always narrows to one shop and a date window first.
CREATE INDEX "PopupEvent_shop_createdAt_idx" ON "PopupEvent"("shop", "createdAt");

-- CreateIndex
-- Then groups by campaign and event type inside that window.
CREATE INDEX "PopupEvent_shop_campaignId_type_idx" ON "PopupEvent"("shop", "campaignId", "type");

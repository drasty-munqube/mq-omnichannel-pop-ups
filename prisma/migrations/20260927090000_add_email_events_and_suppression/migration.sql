-- Purely additive. Existing delivery rows keep working; the new
-- columns start empty and are filled by new sends and by Resend
-- webhooks. Nothing is dropped or rewritten.

-- AlterTable
ALTER TABLE "DiscountDelivery" ADD COLUMN "subject" TEXT;
ALTER TABLE "DiscountDelivery" ADD COLUMN "templateId" TEXT;
ALTER TABLE "DiscountDelivery" ADD COLUMN "provider" TEXT;
ALTER TABLE "DiscountDelivery" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DiscountDelivery" ADD COLUMN "lastEvent" TEXT;
ALTER TABLE "DiscountDelivery" ADD COLUMN "lastEventAt" TIMESTAMP(3);
ALTER TABLE "DiscountDelivery" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "DiscountDelivery" ADD COLUMN "openedAt" TIMESTAMP(3);
ALTER TABLE "DiscountDelivery" ADD COLUMN "clickedAt" TIMESTAMP(3);
ALTER TABLE "DiscountDelivery" ADD COLUMN "bouncedAt" TIMESTAMP(3);
ALTER TABLE "DiscountDelivery" ADD COLUMN "complainedAt" TIMESTAMP(3);

-- CreateIndex
-- Webhooks find the row by the provider's message id.
CREATE INDEX "DiscountDelivery_providerId_idx"
    ON "DiscountDelivery"("providerId");

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_shop_email_key"
    ON "EmailSuppression"("shop", "email");

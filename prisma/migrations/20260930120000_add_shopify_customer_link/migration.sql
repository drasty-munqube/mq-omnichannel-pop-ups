-- Logged-in Shopify customers: remember their customer id on the
-- contact and on each visitor, so their visits link to the contact
-- automatically. Purely additive.

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "shopifyCustomerId" TEXT;
ALTER TABLE "Visitor" ADD COLUMN "shopifyCustomerId" TEXT;

-- CreateIndex
CREATE INDEX "Contact_shop_shopifyCustomerId_idx" ON "Contact"("shop", "shopifyCustomerId");
CREATE INDEX "Visitor_shop_shopifyCustomerId_idx" ON "Visitor"("shop", "shopifyCustomerId");

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "popupId" TEXT,
    "popupName" TEXT,
    "campaignId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "fields" JSONB NOT NULL,
    "pageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_shop_createdAt_idx" ON "Contact"("shop", "createdAt");

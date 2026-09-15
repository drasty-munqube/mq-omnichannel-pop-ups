-- AlterTable
-- Existing campaigns default to running on every website, so nothing
-- that is already live changes behaviour when this ships.
ALTER TABLE "Campaign" ADD COLUMN     "siteTargetMode" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "siteTargets" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'external',
    "autoAdded" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Site_shop_idx" ON "Site"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Site_shop_domain_key" ON "Site"("shop", "domain");

-- CreateTable
CREATE TABLE "EmailDomain" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "resendId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tls" TEXT NOT NULL DEFAULT 'opportunistic',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomain_resendId_key" ON "EmailDomain"("resendId");

-- CreateIndex
CREATE INDEX "EmailDomain_shop_createdAt_idx" ON "EmailDomain"("shop", "createdAt");

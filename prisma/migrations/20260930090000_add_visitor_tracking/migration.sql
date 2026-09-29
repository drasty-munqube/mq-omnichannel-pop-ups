-- Anonymous visitor tracking. Purely additive: two new tables and
-- two new indexes on Contact. Nothing existing is changed.

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "anonymousId" TEXT NOT NULL,
    "contactId" TEXT,
    "identifiedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "firstPageUrl" TEXT,
    "lastPageUrl" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "country" TEXT,
    "source" TEXT NOT NULL DEFAULT 'external',

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "anonymousId" TEXT NOT NULL,
    "contactId" TEXT,
    "campaignId" TEXT,
    "popupId" TEXT,
    "type" TEXT NOT NULL,
    "pageUrl" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "VisitorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_shop_anonymousId_key" ON "Visitor"("shop", "anonymousId");
CREATE INDEX "Visitor_shop_contactId_idx" ON "Visitor"("shop", "contactId");
CREATE INDEX "Visitor_shop_lastSeenAt_idx" ON "Visitor"("shop", "lastSeenAt");

CREATE UNIQUE INDEX "VisitorEvent_eventId_key" ON "VisitorEvent"("eventId");
CREATE INDEX "VisitorEvent_shop_anonymousId_occurredAt_idx" ON "VisitorEvent"("shop", "anonymousId", "occurredAt");
CREATE INDEX "VisitorEvent_shop_contactId_occurredAt_idx" ON "VisitorEvent"("shop", "contactId", "occurredAt");
CREATE INDEX "VisitorEvent_shop_campaignId_occurredAt_idx" ON "VisitorEvent"("shop", "campaignId", "occurredAt");
CREATE INDEX "VisitorEvent_visitorId_occurredAt_idx" ON "VisitorEvent"("visitorId", "occurredAt");

CREATE INDEX "Contact_shop_email_idx" ON "Contact"("shop", "email");
CREATE INDEX "Contact_shop_phone_idx" ON "Contact"("shop", "phone");

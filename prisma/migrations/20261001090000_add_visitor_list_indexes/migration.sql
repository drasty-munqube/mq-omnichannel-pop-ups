-- Indexes for the Visitors page: new visitors in the last 7 days,
-- and popup shown / clicked / signed up counts by type and time.
CREATE INDEX "Visitor_shop_firstSeenAt_idx" ON "Visitor"("shop", "firstSeenAt");
CREATE INDEX "VisitorEvent_shop_type_occurredAt_idx" ON "VisitorEvent"("shop", "type", "occurredAt");

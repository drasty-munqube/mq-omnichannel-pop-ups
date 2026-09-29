-- Submit events record whether the shopper gave an email and a phone
-- number, for the Visitor funnel on Home. Null on older rows.
ALTER TABLE "PopupEvent" ADD COLUMN "hasEmail" BOOLEAN;
ALTER TABLE "PopupEvent" ADD COLUMN "hasPhone" BOOLEAN;

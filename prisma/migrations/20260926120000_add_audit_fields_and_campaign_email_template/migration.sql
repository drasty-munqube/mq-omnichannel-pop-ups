-- Purely additive. Existing rows get empty "created by" / "modified
-- by" values and no email template, which keeps today's behaviour
-- (the built-in coupon email).

-- AlterTable
ALTER TABLE "Popup" ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Popup" ADD COLUMN "updatedBy" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "emailTemplateId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Campaign" ADD COLUMN "updatedBy" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "EmailTemplate" ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmailTemplate" ADD COLUMN "updatedBy" TEXT NOT NULL DEFAULT '';

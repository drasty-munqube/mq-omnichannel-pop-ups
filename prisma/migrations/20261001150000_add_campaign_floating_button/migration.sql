-- Where each campaign's floating button sits. Existing campaigns keep
-- the bottom right corner they always used.
ALTER TABLE "Campaign" ADD COLUMN "floatingButton" TEXT NOT NULL DEFAULT 'bottom_right';

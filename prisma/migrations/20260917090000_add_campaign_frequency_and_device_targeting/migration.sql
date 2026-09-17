-- AlterTable
-- Defaults keep every existing campaign behaving exactly as before:
-- unlimited views, all three device widths, and the one-day dismissal
-- cooldown the widget used to hardcode.
ALTER TABLE "Campaign" ADD COLUMN     "frequencyMode" TEXT NOT NULL DEFAULT 'unlimited',
ADD COLUMN     "frequencyLimit" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "reshowCollectedDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reshowDismissedDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "devices" JSONB NOT NULL DEFAULT '["desktop", "tablet", "mobile"]';

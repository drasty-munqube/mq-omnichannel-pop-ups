-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'targeted',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "audience" TEXT NOT NULL,
    "popupId" TEXT,
    "trigger" TEXT NOT NULL,
    "triggerDelaySeconds" INTEGER NOT NULL DEFAULT 5,
    "triggerScrollPercent" INTEGER NOT NULL DEFAULT 50,
    "pageTargetMode" TEXT NOT NULL DEFAULT 'all',
    "pageTargets" JSONB NOT NULL,
    "reward" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

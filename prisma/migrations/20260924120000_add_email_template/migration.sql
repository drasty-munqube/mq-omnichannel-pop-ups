-- CreateTable
-- Purely additive. Nothing existing reads or writes this table, so
-- applying it cannot change how any current campaign or popup behaves.
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subject" TEXT NOT NULL,
    "previewText" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL DEFAULT '',
    "replyTo" TEXT NOT NULL DEFAULT '',
    "content" JSONB NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Every read is one shop's templates, newest first.
CREATE INDEX "EmailTemplate_shop_updatedAt_idx"
    ON "EmailTemplate"("shop", "updatedAt");

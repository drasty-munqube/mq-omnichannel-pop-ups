import { Prisma } from "@prisma/client";

import db from "../db.server";
import { TEST_URL_MARKERS, realTrafficWhere } from "./test-traffic";

import {
  addCount,
  buildBreakdown,
  buildDailySeries,
  conversionRate,
  dayKey,
  emptyCounts,
  startOfUtcDay,
} from "./analytics";

/* ============================================================
   ANALYTICS — QUERY

   Counting happens in the database; assembling happens in the
   pure helpers next door, which is what makes the arithmetic a
   merchant reads testable without a database anywhere near it.
   ============================================================ */

/* ------------------------------------------------------------
   QUERY
   ------------------------------------------------------------ */

export async function getAnalytics(
  shop: string,
  days: number,
  /* One campaign, or null for all of the shop's campaigns. */
  campaignId: string | null = null,
) {
  const today = new Date();
  const since = startOfUtcDay(today);
  since.setUTCDate(
    since.getUTCDate() - (days - 1),
  );

  /* Test traffic (theme editor, previews) is left out, see
     test-traffic.ts. */
  const where = {
    shop,
    createdAt: { gte: since },
    ...(campaignId ? { campaignId } : {}),
    ...realTrafficWhere,
  };

  const [
    totalsRaw,
    byCampaignRaw,
    byPopupRaw,
    dailyRaw,
    campaigns,
    popups,
  ] = await Promise.all([
    db.popupEvent.groupBy({
      by: ["type"],
      where,
      _count: { _all: true },
    }),

    db.popupEvent.groupBy({
      by: ["campaignId", "type"],
      where,
      _count: { _all: true },
    }),

    db.popupEvent.groupBy({
      by: ["popupId", "type"],
      where,
      _count: { _all: true },
    }),

    /* date_trunc is the one thing Prisma's grouping cannot
       express, and pulling every row back to bucket it in JS
       would not survive a busy shop. */
    db.$queryRaw<
      {
        day: Date;
        type: string;
        count: bigint;
      }[]
    >`
      SELECT date_trunc('day', "createdAt") AS day,
             "type",
             COUNT(*) AS count
      FROM "PopupEvent"
      WHERE "shop" = ${shop}
        AND "createdAt" >= ${since}
        ${campaignId ? Prisma.sql`AND "campaignId" = ${campaignId}` : Prisma.empty}
        AND ("pageUrl" IS NULL OR NOT (${Prisma.join(
          TEST_URL_MARKERS.map((marker) => Prisma.sql`"pageUrl" LIKE ${`%${marker}%`}`),
          " OR ",
        )}))
      GROUP BY 1, 2
      ORDER BY 1
    `,

    db.campaign.findMany({
      where: { shop },
      select: {
        id: true,
        name: true,
        status: true,
      },
    }),

    db.popup.findMany({
      where: { shop },
      select: { id: true, name: true, status: true },
    }),
  ]);

  const totals = emptyCounts();

  for (const row of totalsRaw) {
    addCount(totals, row.type, row._count._all);
  }

  const campaignNames = new Map(
    campaigns.map((campaign) => [
      campaign.id,
      {
        name: campaign.name,
        secondary:
          campaign.status === "active"
            ? "Live"
            : "Draft",
      },
    ]),
  );

  const popupNames = new Map(
    popups.map((popup) => [
      popup.id,
      {
        name: popup.name,
        secondary:
          popup.status === "active"
            ? "Live"
            : "Draft",
      },
    ]),
  );

  return {
    days,
    totals,
    rate: conversionRate(
      totals.view,
      totals.submit,
    ),
    daily: buildDailySeries(
      dailyRaw.map((row) => ({
        day: dayKey(new Date(row.day)),
        type: row.type,
        count: Number(row.count),
      })),
      days,
      today,
    ),
    byCampaign: buildBreakdown(
      byCampaignRaw.map((row) => ({
        id: row.campaignId,
        type: row.type,
        count: row._count._all,
      })),
      campaignNames,
      "Deleted campaign",
    ),
    byPopup: buildBreakdown(
      byPopupRaw.map((row) => ({
        id: row.popupId,
        type: row.type,
        count: row._count._all,
      })),
      popupNames,
      "Deleted popup",
    ),
  };
}

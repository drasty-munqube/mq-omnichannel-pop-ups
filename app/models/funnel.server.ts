/* ============================================================
   CAMPAIGN FUNNELS (server only)

   Counts popup events for the funnels on Home, for one campaign
   or all of the shop's campaigns, over the last N days. Built from
   PopupEvent, which every shopper produces whether or not they
   allowed analytics tracking.
   ============================================================ */

import db from "../db.server";
import { startOfUtcDay } from "./analytics";
import { addFunnelRow, emptyFunnelCounts } from "./funnel";

export async function getFunnelCounts(shop: string, opts: { campaignId: string | null; days: number }, now = new Date()) {
  const since = startOfUtcDay(now);
  since.setUTCDate(since.getUTCDate() - (opts.days - 1));

  const rows = await db.popupEvent.groupBy({
    by: ["type", "hasEmail", "hasPhone"],
    where: {
      shop,
      createdAt: { gte: since },
      ...(opts.campaignId ? { campaignId: opts.campaignId } : {}),
    },
    _count: { _all: true },
  });

  const counts = emptyFunnelCounts();
  for (const row of rows) {
    addFunnelRow(counts, { type: row.type, hasEmail: row.hasEmail, hasPhone: row.hasPhone, count: row._count._all });
  }
  return counts;
}

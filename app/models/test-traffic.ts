/* ============================================================
   TEST TRAFFIC (shared, browser-safe)

   A merchant trying their own popup (in the Shopify theme editor,
   a theme preview, or an MQ preview link) must never count in the
   numbers on Home. The widget scripts already say so with a
   `test` flag, but older script versions did not, and earlier
   events were stored without it. Those pages can still be told
   apart by their address, so the server checks the page URL too:
   new events from a test page are not stored, and old ones are
   left out when counting.

   Markers:
     oseid=, preview_theme_id=, design_mode=   Shopify theme editor
                                               and theme previews
     mq_campaign=                              MQ "Preview on store"
     .shopifypreview.com                       shared theme previews
   ============================================================ */

export const TEST_URL_MARKERS = ["oseid=", "preview_theme_id=", "design_mode=", "mq_campaign=", ".shopifypreview.com"] as const;

export function isTestPageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const value = String(url).toLowerCase();
  return TEST_URL_MARKERS.some((marker) => value.includes(marker));
}

/* Prisma filter: events from a real shopper page. Rows with no
   page URL are kept (older events, and ones sent without it).
   Written as "no URL, or none of the markers" because a plain NOT
   on a nullable column would also drop the rows with no URL. */
export const realTrafficWhere = {
  OR: [{ pageUrl: null }, { NOT: { OR: TEST_URL_MARKERS.map((marker) => ({ pageUrl: { contains: marker } })) } }],
};

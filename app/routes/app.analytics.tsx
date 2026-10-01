/* ============================================================
   ANALYTICS (moved)

   Analytics is part of Home now: the Performance section there
   has the same numbers, daily trends and per-campaign /
   per-popup tables, next to the funnels. This route only sends
   old links and bookmarks there, keeping the chosen date range.
   ============================================================ */

import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { redirect } = await authenticate.admin(request);
  const days = new URL(request.url).searchParams.get("days");
  return redirect(days ? `/app?days=${encodeURIComponent(days)}` : "/app");
}

/* Never rendered: the loader always redirects. */
export default function AnalyticsMoved() {
  return null;
}

/* ============================================================
   PUBLIC VISITOR TRACKING  (POST /api/track)

   Called by the universal embed script (public/mq-widget.js) on
   any website. Registers the anonymous visitor and stores a small
   batch of events (page_view, popup_shown, popup_closed).

   Body (sent as text/plain JSON, so no CORS preflight):
     { shop, anonymousId, context: { pageUrl, referrer, device },
       events: [{ eventId, type, campaignId, popupId, pageUrl,
                  occurredAt }] }

   Like /api/widget, "shop" must be a shop this app is installed
   for. Rate limited per visitor, per address and per shop.
   ============================================================ */

import type { ActionFunctionArgs } from "react-router";

import { handleTrack, isInstalledShop, readJsonBody } from "../models/track-endpoint.server";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { ...CORS_HEADERS, ...headers } });
}

export async function loader() {
  return json({ ok: false, error: "Method Not Allowed" }, 405);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const read = await readJsonBody(request);
  if (!read.ok) return json({ ok: false, error: read.error }, read.status);

  const shop = String((read.body as { shop?: unknown })?.shop || "");
  if (!(await isInstalledShop(shop))) return json({ ok: false, error: "Unknown shop." }, 404);

  const outcome = await handleTrack(request, shop, "external", read.body);
  return json(outcome.body, outcome.status, outcome.headers);
}

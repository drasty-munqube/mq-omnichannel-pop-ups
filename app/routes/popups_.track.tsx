/* ============================================================
   STOREFRONT VISITOR TRACKING  (App Proxy)

   Reached at https://<shop>/apps/mq-popups/popups/track by the
   theme app embed (extensions/mq-popup-embed). Shopify signs the
   request and authenticate.public.appProxy checks it, so the shop
   comes from Shopify, not from the body. Same payload and rules as
   /api/track (see api.track.tsx).

   Named popups_.track so it is not nested under popups.tsx, which
   is a resource route of its own.
   ============================================================ */

import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import { handleTrack, proxyRequestInfo, readJsonBody } from "../models/track-endpoint.server";

export async function loader() {
  return Response.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.public.appProxy(request);
  const shop = session?.shop || new URL(request.url).searchParams.get("shop") || "";
  if (!shop) return Response.json({ ok: false, error: "Unknown shop." }, { status: 400 });

  const read = await readJsonBody(request);
  if (!read.ok) return Response.json({ ok: false, error: read.error }, { status: read.status });

  const outcome = await handleTrack(request, shop, "shopify", read.body, proxyRequestInfo(request));
  return Response.json(outcome.body, { status: outcome.status, headers: outcome.headers });
}

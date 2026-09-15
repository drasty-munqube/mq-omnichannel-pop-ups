import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import db from "../db.server";
import {
  getEligibleCampaigns,
  saveSubmission,
} from "../models/popup-widget.server";
import { touchSite } from "../models/site.server";

/* ============================================================
   PUBLIC CROSS-SITE WIDGET ENDPOINT

   Unlike proxy.popups.tsx (only reachable from inside a Shopify
   storefront via signed App Proxy requests), this endpoint has
   no Shopify context at all — it's what makes it possible to
   embed a popup on ANY website: a landing page, a blog, a
   completely separate storefront.

   Because there's no Shopify signature to verify here, "shop"
   doubles as the public identifier a merchant puts on their
   <script> tag. The only guard is that it must match a shop
   this app is actually installed for (a Session row exists) —
   this is meant-to-be-public marketing content, not sensitive
   data, so that's a reasonable bar for v1. Tighten later with a
   dedicated per-shop public key if this becomes a concern.

   CORS is wide open (Access-Control-Allow-Origin: *) since the
   whole point is arbitrary third-party origins calling in.
   ============================================================ */

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(
  data: unknown,
  init: ResponseInit = {},
) {
  return Response.json(data, {
    ...init,
    headers: { ...CORS_HEADERS, ...init.headers },
  });
}

async function isInstalledShop(shop: string) {
  if (!shop) {
    return false;
  }

  const session = await db.session.findFirst({
    where: { shop },
    select: { id: true },
  });

  return Boolean(session);
}

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";

  if (!(await isInstalledShop(shop))) {
    return json(
      { campaigns: [], error: "Unknown shop." },
      { status: 404 },
    );
  }

  /* The widget reports the hostname it is running on. We turn
     that into a site row (creating one the first time we see a
     website) so the merchant can target campaigns per site and
     can see where their snippet actually ended up.

     If the host is missing or unusable, site stays null and
     only all-website campaigns are served. Falling back to the
     Referer means an older copy of the widget, cached on some
     customer's site, still resolves correctly. */

  const reportedHost =
    url.searchParams.get("host") ||
    request.headers.get("referer") ||
    "";

  const site = await touchSite(
    shop,
    reportedHost,
  );

  return json({
    campaigns: await getEligibleCampaigns(
      shop,
      site ? site.id : null,
    ),
  });
}

export async function action({
  request,
}: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  let body: {
    shop?: string;
    popupId?: string;
    popupName?: string;
    campaignId?: string;
    email?: string;
    phone?: string;
    fields?: Record<string, string>;
    pageUrl?: string;
  };

  try {
    body = await request.json();
  } catch {
    return json(
      { ok: false, error: "Invalid submission." },
      { status: 400 },
    );
  }

  const shop = body.shop || "";

  if (!(await isInstalledShop(shop))) {
    return json(
      { ok: false, error: "Unknown shop." },
      { status: 404 },
    );
  }

  try {
    await saveSubmission(shop, body);
    return json({ ok: true });
  } catch (error) {
    console.error(
      "WIDGET SUBMISSION ERROR:",
      error,
    );

    return json(
      {
        ok: false,
        error: "Unable to save submission.",
      },
      { status: 500 },
    );
  }
}

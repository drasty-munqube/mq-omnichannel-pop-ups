import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import { authenticate } from "../shopify.server";
import {
  getEligibleCampaigns,
  recordEvent,
  saveSubmission,
} from "../models/popup-widget.server";
import { ensureShopifySite } from "../models/site.server";

/* ============================================================
   SHOPIFY STOREFRONT ENDPOINT (App Proxy)

   Reached at https://<shop>/apps/mq-popups/popups by the theme
   app extension. Shopify signs every request; authenticate.
   public.appProxy(request) verifies that signature before this
   code runs, so no separate auth check is needed here.

   WHY THIS FILE IS NAMED popups.tsx

   Shopify strips the prefix and subpath and appends whatever is
   left to the proxy URL. With app_proxy.url set to the app's
   root, /apps/mq-popups/popups arrives here as /popups — so the
   route has to live at /popups, not /proxy/popups. It was named
   proxy.popups.tsx before, which resolved to /proxy/popups and
   returned 404 to every storefront request. If app_proxy.url
   ever gains a /proxy suffix, rename this back to match.

   For any OTHER website (not a Shopify storefront), see
   app/routes/api.widget.tsx instead — App Proxy only works
   from inside Shopify.
   ============================================================ */

function resolveShop(
  request: Request,
  sessionShop: string | undefined,
) {
  if (sessionShop) {
    return sessionShop;
  }

  const url = new URL(request.url);
  return url.searchParams.get("shop") || "";
}

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const { session } =
    await authenticate.public.appProxy(request);

  const shop = resolveShop(request, session?.shop);

  if (!shop) {
    return Response.json(
      { campaigns: [] },
      { status: 400 },
    );
  }

  /* The storefront is a targetable site like any other, so it
     needs its own row before a campaign can be scoped to it.
     Created on demand here, which means shops that existed
     before site targeting get one on their next storefront
     request without a data migration. */

  const site = await ensureShopifySite(shop);

  return Response.json({
    campaigns: await getEligibleCampaigns(
      shop,
      site ? site.id : null,
    ),
  });
}

export async function action({
  request,
}: ActionFunctionArgs) {
  const { session } =
    await authenticate.public.appProxy(request);

  const shop = resolveShop(request, session?.shop);

  if (!shop) {
    return Response.json(
      { ok: false, error: "Unknown shop." },
      { status: 400 },
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid submission." },
      { status: 400 },
    );
  }

  /* Two different things arrive on this one endpoint. An event
     carries a "type" ("view" or "dismiss") and is fire and
     forget; a submission carries the shopper's details. Keeping
     them on one route means the theme app embed only ever needs
     the single proxy path it already has. */

  if (body && typeof body.type === "string") {
    await recordEvent(shop, "shopify", body);
    return Response.json({ ok: true });
  }

  try {
    await saveSubmission(shop, body, "shopify");
    return Response.json({ ok: true });
  } catch (error) {
    console.error(
      "POPUP SUBMISSION ERROR:",
      error,
    );

    return Response.json(
      {
        ok: false,
        error: "Unable to save submission.",
      },
      { status: 500 },
    );
  }
}

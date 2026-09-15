import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import { authenticate } from "../shopify.server";
import {
  getEligibleCampaigns,
  saveSubmission,
} from "../models/popup-widget.server";
import { ensureShopifySite } from "../models/site.server";

/* ============================================================
   SHOPIFY STOREFRONT ENDPOINT (App Proxy)

   Reached at https://<shop>/apps/mq-popups/popups by the theme
   app extension. Shopify signs every request; authenticate.
   public.appProxy(request) verifies that signature before this
   code runs, so no separate auth check is needed here.

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

  try {
    await saveSubmission(shop, body);
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

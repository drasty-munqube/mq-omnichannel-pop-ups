import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";

/* ============================================================
   PUBLIC STOREFRONT ENDPOINT (Shopify App Proxy)

   Reached at https://<shop>/apps/mq-popups/popups by the theme
   app extension. Shopify signs every request; authenticate.
   public.appProxy(request) verifies that signature before this
   code runs, so no separate auth check is needed here.

   GET  -> the live campaigns (+ their popup content) eligible
           to show on the storefront right now.
   POST -> a shopper's popup form submission, stored as a Contact.
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

  const campaigns = await db.campaign.findMany({
    where: {
      shop,
      status: "active",
      popupId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
  });

  const popupIds = campaigns
    .map((campaign) => campaign.popupId)
    .filter((id): id is string => Boolean(id));

  const popups = await db.popup.findMany({
    where: {
      shop,
      id: { in: popupIds },
      status: "active",
    },
  });

  const popupById = new Map(
    popups.map((popup) => [popup.id, popup]),
  );

  const eligible = campaigns
    .map((campaign) => {
      const popup = campaign.popupId
        ? popupById.get(campaign.popupId)
        : null;

      if (!popup) {
        return null;
      }

      return {
        campaignId: campaign.id,
        popupId: popup.id,
        popupName: popup.name,
        trigger: campaign.trigger,
        triggerDelaySeconds:
          campaign.triggerDelaySeconds,
        triggerScrollPercent:
          campaign.triggerScrollPercent,
        pageTargetMode: campaign.pageTargetMode,
        pageTargets: Array.isArray(
          campaign.pageTargets,
        )
          ? campaign.pageTargets
          : [],
        steps: popup.steps,
      };
    })
    .filter((campaign) => campaign !== null);

  return Response.json({
    campaigns: eligible,
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

  let body: {
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
    return Response.json(
      { ok: false, error: "Invalid submission." },
      { status: 400 },
    );
  }

  const fields = body.fields || {};

  const email =
    body.email ||
    Object.values(fields).find((value) =>
      /@/.test(value || ""),
    ) ||
    null;

  try {
    await db.contact.create({
      data: {
        shop,
        popupId: body.popupId || null,
        popupName: body.popupName || null,
        campaignId: body.campaignId || null,
        email,
        phone: body.phone || null,
        fields,
        pageUrl: body.pageUrl || null,
      },
    });

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

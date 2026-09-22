import db from "../db.server";

/* ============================================================
   SHARED WIDGET DATA ACCESS

   Used by both the Shopify App Proxy endpoint (proxy.popups.tsx,
   only reachable from inside a Shopify storefront) and the
   public cross-site widget endpoint (api.widget.tsx, reachable
   from any website). Keeping the query logic in one place means
   both surfaces always agree on which campaigns are "live".
   ============================================================ */

export type EligibleCampaign = {
  campaignId: string;
  popupId: string;
  popupName: string;
  audience: string;
  trigger: string;
  triggerDelaySeconds: number;
  triggerScrollPercent: number;
  pageTargetMode: string;
  pageTargets: unknown;
  frequencyMode: string;
  frequencyLimit: number;
  reshowCollectedDays: number;
  reshowDismissedDays: number;
  devices: unknown;
  steps: unknown;
};

/* ------------------------------------------------------------
   Device buckets are stored as an array so a campaign can name
   any combination. Anything unreadable falls back to all three,
   which is the same as no device targeting at all — a broken
   value should never silently hide a campaign everywhere.
   ------------------------------------------------------------ */

const ALL_DEVICES = [
  "desktop",
  "tablet",
  "mobile",
];

function normalizeDevices(value: unknown) {
  if (!Array.isArray(value)) {
    return ALL_DEVICES;
  }

  const devices = value
    .map((item) => String(item))
    .filter((item) =>
      ALL_DEVICES.includes(item),
    );

  return devices.length > 0
    ? devices
    : ALL_DEVICES;
}

/* ------------------------------------------------------------
   Does this campaign belong on the website asking for it?

   "all" means every website carrying the snippet, which is the
   default and what every campaign created before site
   targeting existed still uses. "selected" means the campaign
   only runs on the sites the merchant picked.

   siteId is null when the caller could not resolve the
   hostname to a known site. In that case only all-website
   campaigns are served, so an unrecognised domain can never
   pull a campaign that was scoped to somewhere else.
   ------------------------------------------------------------ */

function runsOnSite(
  campaign: {
    siteTargetMode: string;
    siteTargets: unknown;
  },
  siteId: string | null,
) {
  if (campaign.siteTargetMode !== "selected") {
    return true;
  }

  if (!siteId) {
    return false;
  }

  const targets = Array.isArray(
    campaign.siteTargets,
  )
    ? (campaign.siteTargets as string[])
    : [];

  return targets.includes(siteId);
}

export async function getEligibleCampaigns(
  shop: string,
  siteId: string | null = null,
): Promise<EligibleCampaign[]> {
  const allCampaigns =
    await db.campaign.findMany({
      where: {
        shop,
        status: "active",
        popupId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
    });

  const campaigns = allCampaigns.filter(
    (campaign) => runsOnSite(campaign, siteId),
  );

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

  const mapped: (EligibleCampaign | null)[] =
    campaigns.map((campaign) => {
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
        /* Audience is chosen in the Target step and was, until
           now, never sent to the widget — so it was stored but
           never enforced. */
        audience: campaign.audience,
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
        frequencyMode: campaign.frequencyMode,
        frequencyLimit: campaign.frequencyLimit,
        reshowCollectedDays:
          campaign.reshowCollectedDays,
        reshowDismissedDays:
          campaign.reshowDismissedDays,
        devices: normalizeDevices(
          campaign.devices,
        ),
        steps: popup.steps,
      };
    });

  return mapped.filter(
    (campaign): campaign is EligibleCampaign =>
      campaign !== null,
  );
}

export type SubmissionInput = {
  popupId?: string;
  device?: string;
  popupName?: string;
  campaignId?: string;
  email?: string;
  phone?: string;
  fields?: Record<string, string>;
  pageUrl?: string;
};

export async function saveSubmission(
  shop: string,
  body: SubmissionInput,
  source: EventSource = "shopify",
) {
  const fields = body.fields || {};

  const email =
    body.email ||
    Object.values(fields).find((value) =>
      /@/.test(value || ""),
    ) ||
    null;

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

  /* The submit event is written here rather than sent by the
     widget, because this is the one moment the server can be
     certain a submission really happened. A browser-sent event
     can be lost to a navigation, blocked, or replayed; a Contact
     row and its matching event are written by the same call. */

  await recordEvent(shop, source, {
    campaignId: body.campaignId,
    popupId: body.popupId,
    type: "submit",
    device: body.device,
    pageUrl: body.pageUrl,
  });
}

/* ============================================================
   EVENTS

   Contacts only records the people who said yes, so on its own
   it can never answer "what share of the people who saw this
   actually converted". These rows are the denominator: one per
   impression, submission and dismissal.

   Nothing here is allowed to throw. Analytics is a reporting
   feature, and a failure to record a number must never stop a
   campaign from being served or a shopper's details from being
   saved.
   ============================================================ */

export type EventSource = "shopify" | "external";

const EVENT_TYPES = [
  "view",
  "submit",
  "dismiss",
];

export type EventInput = {
  campaignId?: string;
  popupId?: string;
  type?: string;
  device?: string;
  pageUrl?: string;
};

/* Page URLs come from arbitrary websites, so they are capped
   before they reach the database. 2048 is the longest URL any
   mainstream browser will produce. */
const MAX_PAGE_URL = 2048;

export async function recordEvent(
  shop: string,
  source: EventSource,
  input: EventInput,
) {
  const type = String(input.type || "");

  /* An unknown type would quietly corrupt every total that
     counts by type, so it is dropped rather than stored. */
  if (!EVENT_TYPES.includes(type)) {
    return false;
  }

  const campaignId = String(
    input.campaignId || "",
  );

  if (!campaignId) {
    return false;
  }

  const device = String(input.device || "");

  const pageUrl = input.pageUrl
    ? String(input.pageUrl).slice(0, MAX_PAGE_URL)
    : null;

  try {
    await db.popupEvent.create({
      data: {
        shop,
        campaignId,
        popupId: input.popupId || null,
        type,
        device: ALL_DEVICES.includes(device)
          ? device
          : null,
        source,
        pageUrl,
      },
    });

    return true;
  } catch (error) {
    console.error("POPUP EVENT ERROR:", error);
    return false;
  }
}

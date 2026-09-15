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
  trigger: string;
  triggerDelaySeconds: number;
  triggerScrollPercent: number;
  pageTargetMode: string;
  pageTargets: unknown;
  steps: unknown;
};

export async function getEligibleCampaigns(
  shop: string,
): Promise<EligibleCampaign[]> {
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
    });

  return mapped.filter(
    (campaign): campaign is EligibleCampaign =>
      campaign !== null,
  );
}

export type SubmissionInput = {
  popupId?: string;
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
}

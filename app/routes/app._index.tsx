import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useNavigation, useSearchParams } from "react-router";
import { ArrowRight, Eye, LayoutTemplate, Percent, Plus, UserPlus, Users } from "lucide-react";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getAnalytics } from "../models/analytics.server";
import { Breakdown, Stat, TrendChart } from "../components/analytics-charts";
import {
  color,
  radius,
  space,
  text,
} from "../design/tokens";
import {
  badge,
  button,
  card,
  input,
  emptyState,
  eyebrow,
  interactive,
  pageSubtitle,
  pageTitle,
} from "../design/styles";
import { useScrollReveal } from "../design/useScrollReveal";
import { SetupGuide } from "../components/setup-guide";
import { FunnelChart } from "../components/funnel-chart";
import { RANGES, formatRate, normalizeDays, startOfUtcDay } from "../models/analytics";
import { simpleFunnel } from "../models/funnel";
import { getFunnelCounts } from "../models/funnel.server";
import { buildChecklist, themeEditorUrl } from "../models/onboarding";
import { Select } from "../components/select";

/* ============================================================
   LOADER

   Everything here comes from the database. Metrics that need
   conversion tracking (revenue, opt-in rate, contacts, message
   ROI) have no source yet, so the loader reports them as
   unavailable rather than inventing numbers — the UI renders a
   "needs tracking" state for those tiles.
   ============================================================ */

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const { session } =
    await authenticate.admin(request);

  /* The Performance section (what used to be the Analytics
     page, plus the funnels): one campaign or all of them, over
     7, 30 or 90 days. The older funnelDays / funnelCampaign
     names still work for saved links. The campaign id is
     checked against this shop's campaigns below. */
  const url = new URL(request.url);
  const days = normalizeDays(
    url.searchParams.get("days") || url.searchParams.get("funnelDays"),
  );
  const campaignParam =
    url.searchParams.get("campaign") ||
    url.searchParams.get("funnelCampaign") ||
    "";

  const [campaigns, popups, setup] =
    await Promise.all([
      db.campaign.findMany({
        where: { shop: session.shop },
        orderBy: [
          { status: "asc" },
          { updatedAt: "desc" },
        ],
      }),
      db.popup.findMany({
        where: { shop: session.shop },
        orderBy: { updatedAt: "desc" },
      }),
      /* For the setup guide: has the storefront sent anything yet
         (proof the app embed is on), is a sending domain verified,
         and has anyone signed up. */
      Promise.all([
        db.popupEvent.findFirst({
          where: { shop: session.shop, source: "shopify" },
          select: { id: true },
        }),
        db.visitor.findFirst({
          where: { shop: session.shop, source: "shopify" },
          select: { id: true },
        }),
        db.emailDomain.count({
          where: { shop: session.shop, status: "verified" },
        }),
        db.contact.count({
          where: { shop: session.shop },
        }),
      ]),
    ]);

  const [storefrontEvent, storefrontVisitor, verifiedDomainCount, contactCount] = setup;

  const campaignId = campaigns.some((c) => c.id === campaignParam) ? campaignParam : null;
  const since = startOfUtcDay(new Date());
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const [funnelCounts, analytics, newContactCount] = await Promise.all([
    getFunnelCounts(session.shop, { campaignId, days }),
    getAnalytics(session.shop, days, campaignId),
    db.contact.count({
      where: {
        shop: session.shop,
        createdAt: { gte: since },
        ...(campaignId ? { campaignId } : {}),
      },
    }),
  ]);

  const liveCampaigns = campaigns.filter(
    (campaign) =>
      campaign.status.toLowerCase() === "active",
  );

  const livePopups = popups.filter(
    (popup) =>
      popup.status.toLowerCase() === "active",
  );

  const setupSteps = buildChecklist(
    {
      storefrontSeen: Boolean(storefrontEvent || storefrontVisitor),
      popupCount: popups.length,
      liveCampaignCount: liveCampaigns.length,
      verifiedDomainCount,
      contactCount,
    },
    {
      themeEditorUrl: themeEditorUrl(
        session.shop,
        process.env.SHOPIFY_API_KEY || "",
      ),
    },
  );

  return {
    shop: session.shop,
    setupSteps,

    funnel: {
      campaignId,
      days,
      counts: funnelCounts,
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, live: c.status.toLowerCase() === "active" })),
    },

    analytics,
    contactCount,
    newContactCount,

    campaignCount: campaigns.length,
    liveCampaignCount: liveCampaigns.length,
    popupCount: popups.length,
    livePopupCount: livePopups.length,

    /* newest first, capped for the dashboard card */
    runningNow: campaigns
      .filter(
        (campaign) =>
          campaign.status.toLowerCase() ===
          "active",
      )
      .slice(0, 4)
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        trigger: campaign.trigger,
        triggerDelaySeconds:
          campaign.triggerDelaySeconds,
        triggerScrollPercent:
          campaign.triggerScrollPercent,
        audience: campaign.audience,
        popupId: campaign.popupId,
        rewardDiscountCode:
          campaign.rewardDiscountCode,
      })),

    recentDrafts: campaigns
      .filter(
        (campaign) =>
          campaign.status.toLowerCase() !==
          "active",
      )
      .slice(0, 3)
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        audience: campaign.audience,
      })),

    popupNames: popups.map((popup) => ({
      id: popup.id,
      name: popup.name,
    })),
  };
}

/* ============================================================
   HOME
   ============================================================ */

export default function Index() {
  const {
    shop,
    setupSteps,
    funnel,
    analytics,
    contactCount,
    newContactCount,
    campaignCount,
    liveCampaignCount,
    livePopupCount,
    runningNow,
    recentDrafts,
    popupNames,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const funnelLoading =
    navigation.state === "loading" &&
    navigation.location?.pathname === "/app";

  const setFunnel = (key: "campaign" | "days", value: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete("funnelCampaign");
    next.delete("funnelDays");
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  };

  /* One funnel: shown, opened (when the script reports it), signed up. */
  const funnelSteps = simpleFunnel(funnel.counts);
  const hasActivity = analytics.totals.view + analytics.totals.submit + analytics.totals.dismiss > 0;
  const [trend, setTrend] = useState<"views" | "signups">("views");

  useScrollReveal();

  const popupNameById = (id: string | null) =>
    popupNames.find((popup) => popup.id === id)
      ?.name;

  const triggerLabel = (campaign: {
    trigger: string;
    triggerDelaySeconds: number;
    triggerScrollPercent: number;
  }) => {
    if (campaign.trigger === "After delay") {
      return `after ${campaign.triggerDelaySeconds}s`;
    }

    if (campaign.trigger === "Scroll depth") {
      return `scroll ${campaign.triggerScrollPercent}%`;
    }

    return campaign.trigger.toLowerCase();
  };

  /* No `heading` on <s-page> on purpose: the page renders its
     own <h1> below, and setting both draws a second title bar
     above it that only eats vertical space. */

  return (
    <s-page inlineSize="large">

      {/* =====================================================
          PAGE HEADER
      ===================================================== */}

      <div
        className="mq-page"
        style={{ marginBottom: space[7] }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: space[7],
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={pageTitle()}>Home</h1>
            <p style={pageSubtitle()}>
              Your MQ overview — {liveCampaignCount}{" "}
              live campaign
              {liveCampaignCount === 1 ? "" : "s"} and{" "}
              {livePopupCount} live popup
              {livePopupCount === 1 ? "" : "s"}.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: space[4],
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              {...interactive}
              onClick={() =>
                navigate("/app/popups")
              }
              style={button("secondary", "md")}
            >
              <LayoutTemplate aria-hidden size={15} strokeWidth={2} />
              Manage popups
            </button>

            <button
              type="button"
              {...interactive}
              onClick={() =>
                navigate("/app/campaigns")
              }
              style={button("primary", "md")}
            >
              <Plus aria-hidden size={15} strokeWidth={2} />
              Create campaign
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================
          SETUP GUIDE (first-time checklist)
      ===================================================== */}

      <SetupGuide shop={shop} steps={setupSteps} />

      {/* =====================================================
          PERFORMANCE

          Kept deliberately short: one filter row, four numbers,
          then the funnel and the daily trend side by side, and
          the per-campaign table. Everything below the filter
          follows the campaign and date range chosen there.
      ===================================================== */}

      <section
        aria-labelledby="mq-performance-title"
        style={{ marginBottom: space[7] }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: space[5],
            flexWrap: "wrap",
            marginBottom: space[5],
          }}
        >
          <h2
            id="mq-performance-title"
            style={{ margin: 0, ...text.h3, color: color.textStrong }}
          >
            Performance
          </h2>

          <div style={{ display: "flex", gap: space[3], flexWrap: "wrap", alignItems: "center" }}>
            <Select
              aria-label="Campaign"
              value={funnel.campaignId || ""}
              onChange={(event) => setFunnel("campaign", event.target.value)}
              style={{
                ...input(),
                width: "auto",
                maxWidth: "240px",
                paddingTop: space[3],
                paddingBottom: space[3],
              }}
            >
              <option value="">All campaigns</option>
              {funnel.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.live ? "" : " (not live)"}
                </option>
              ))}
            </Select>

            <div
              role="group"
              aria-label="Date range"
              style={{
                display: "inline-flex",
                padding: "3px",
                borderRadius: radius.md,
                background: color.surfaceSunken,
                border: `1px solid ${color.border}`,
              }}
            >
              {RANGES.map((d) => {
                const active = funnel.days === d;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFunnel("days", d === 30 ? "" : String(d))}
                    style={{
                      padding: `${space[2]} ${space[5]}`,
                      border: 0,
                      borderRadius: radius.sm,
                      background: active ? color.surface : "transparent",
                      boxShadow: active ? "0 1px 2px rgba(23, 32, 51, 0.12)" : "none",
                      color: active ? color.textStrong : color.textMuted,
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {d} days
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div
          aria-busy={funnelLoading}
          style={{ opacity: funnelLoading ? 0.6 : 1, transition: "opacity 150ms" }}
        >
          {/* FOUR NUMBERS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: space[4],
              marginBottom: space[5],
            }}
          >
            <Stat icon={Eye} label="Views" value={analytics.totals.view.toLocaleString()} note="Popup reached a screen" />
            <Stat icon={UserPlus} label="Signups" value={analytics.totals.submit.toLocaleString()} note="Left an email or phone" />
            <Stat icon={Percent} label="Conversion" value={formatRate(analytics.rate)} note="Signups out of views" />
            <Stat icon={Users} label="New contacts" value={newContactCount.toLocaleString()} note={`${contactCount.toLocaleString()} contact${contactCount === 1 ? "" : "s"} in total`} />
          </div>

          {!hasActivity ? (
            <div
              style={{
                ...card({ elevation: "flat" }),
                padding: `${space[8]} ${space[6]}`,
                textAlign: "center",
                ...text.body,
                color: color.textMuted,
              }}
            >
              Nothing recorded in the last {funnel.days} days yet. Numbers show up once a campaign and its popup are
              both live and shoppers visit your store.
            </div>
          ) : (
            <>
              {/* FUNNEL + TREND */}
              <div className="mq-grid-halves" style={{ gap: space[5], marginBottom: space[5] }}>
                <div style={{ ...card({ elevation: "raised" }), padding: space[7] }}>
                  <h3 style={{ margin: `0 0 ${space[6]}`, ...text.h4, color: color.textStrong }}>Funnel</h3>
                  <FunnelChart label="Funnel" steps={funnelSteps} compare="previous" />
                  <p style={{ margin: `${space[6]} 0 0`, ...text.caption, color: color.textMuted }}>
                    {funnel.counts.withEmail.toLocaleString()} with email · {funnel.counts.withPhone.toLocaleString()} with phone
                    {funnel.counts.unflaggedSubmits > 0
                      ? ` · ${funnel.counts.unflaggedSubmits.toLocaleString()} older signup${funnel.counts.unflaggedSubmits === 1 ? "" : "s"} from before email and phone were recorded`
                      : ""}
                    . Tests from the theme editor and previews are not counted.
                  </p>
                </div>

                <TrendChart
                  title={trend === "views" ? "Views per day" : "Signups per day"}
                  color={trend === "views" ? "#2a78d6" : "#eb6834"}
                  series={analytics.daily}
                  valueOf={(point) => (trend === "views" ? point.views : point.submits)}
                  actions={
                    <div role="group" aria-label="Chart" style={{ display: "inline-flex", gap: space[2] }}>
                      {(["views", "signups"] as const).map((key) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={trend === key}
                          onClick={() => setTrend(key)}
                          style={button(trend === key ? "secondary" : "tertiary", "sm")}
                        >
                          {key === "views" ? <Eye aria-hidden size={15} strokeWidth={2} /> : <UserPlus aria-hidden size={15} strokeWidth={2} />}
                          {key === "views" ? "Views" : "Signups"}
                        </button>
                      ))}
                    </div>
                  }
                />
              </div>

              {/* ONE TABLE, only when looking at all campaigns */}
              {funnel.campaignId ? null : (
                <Breakdown
                  heading="Campaigns"
                  empty="No campaign has been seen in this period."
                  rows={analytics.byCampaign}
                />
              )}
            </>
          )}
        </div>
      </section>

      {/* =====================================================
          RUNNING NOW
      ===================================================== */}

      <div
        style={{
          marginBottom: space[5],
        }}
      >

        {/* ---------------- RUNNING NOW ---------------- */}

        <div
          data-mq-reveal
          style={card({ elevation: "raised" })}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: space[5],
              padding: `${space[6]} ${space[7]}`,
              borderBottom: `1px solid ${color.borderSubtle}`,
            }}
          >
            <h2
              style={{
                margin: 0,
                ...text.h3,
                color: color.textStrong,
              }}
            >
              Running now
            </h2>

            <button
              type="button"
              {...interactive}
              onClick={() =>
                navigate("/app/campaigns")
              }
              style={{
                ...button("tertiary", "sm"),
                color: color.primary,
                padding: `0 ${space[3]}`,
              }}
            >
              All campaigns
              <ArrowRight aria-hidden size={15} strokeWidth={2} />
            </button>
          </div>

          {runningNow.length === 0 ? (

            <div style={emptyState()}>
              <strong
                style={{
                  ...text.h4,
                  color: color.textStrong,
                }}
              >
                Nothing live yet
              </strong>

              <p
                style={{
                  margin: 0,
                  maxWidth: "300px",
                  ...text.body,
                  color: color.textMuted,
                }}
              >
                {campaignCount === 0
                  ? "Create your first campaign to see it here."
                  : "Set a campaign to Live and it shows up here."}
              </p>

              <button
                type="button"
                {...interactive}
                onClick={() =>
                  navigate("/app/campaigns")
                }
                style={{
                  ...button("secondary", "sm"),
                  marginTop: space[2],
                }}
              >
                {campaignCount === 0
                  ? "Create campaign"
                  : "Open campaigns"}
              </button>
            </div>

          ) : (

            <div
              data-mq-stagger
              style={{
                display: "flex",
                flexDirection: "column",
                gap: space[4],
                padding: space[6],
              }}
            >
              {runningNow.map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  data-mq="pressable"
                  onClick={() =>
                    navigate("/app/campaigns")
                  }
                  style={{
                    ...card({
                      elevation: "flat",
                      interactive: true,
                    }),
                    padding: `${space[5]} ${space[6]}`,
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    justifyContent:
                      "space-between",
                    gap: space[5],
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <strong
                      style={{
                        display: "block",
                        ...text.h4,
                        color: color.textStrong,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {campaign.name}
                    </strong>

                    <span
                      style={{
                        display: "block",
                        marginTop: space[1],
                        ...text.caption,
                        color: color.textMuted,
                      }}
                    >
                      {campaign.audience ||
                        "No audience"}{" "}
                      · {triggerLabel(campaign)}
                      {popupNameById(
                        campaign.popupId,
                      )
                        ? ` · ${popupNameById(
                            campaign.popupId,
                          )}`
                        : ""}
                      {campaign.rewardDiscountCode
                        ? ` · ${campaign.rewardDiscountCode}`
                        : ""}
                    </span>
                  </span>

                  <span
                    style={{
                      ...badge("success"),
                      flexShrink: 0,
                    }}
                  >
                    LIVE
                  </span>
                </button>
              ))}

              {recentDrafts.length > 0 && (
                <div
                  style={{
                    marginTop: space[2],
                    paddingTop: space[5],
                    borderTop: `1px solid ${color.borderSubtle}`,
                  }}
                >
                  <div
                    style={{
                      ...eyebrow("muted"),
                      marginBottom: space[4],
                    }}
                  >
                    In progress
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: space[3],
                    }}
                  >
                    {recentDrafts.map((draft) => (
                      <div
                        key={draft.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent:
                            "space-between",
                          gap: space[4],
                        }}
                      >
                        <span
                          style={{
                            ...text.bodySm,
                            color: color.text,
                            overflow: "hidden",
                            textOverflow:
                              "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {draft.name}
                        </span>

                        <span
                          style={{
                            ...badge("neutral"),
                            flexShrink: 0,
                          }}
                        >
                          DRAFT
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          )}
        </div>

      </div>

    </s-page>
  );
}

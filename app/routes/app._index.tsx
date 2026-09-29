import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useNavigation, useSearchParams } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  addCount,
  conversionRate,
  emptyCounts,
  formatRate,
} from "../models/analytics";
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
import { RANGES, normalizeDays } from "../models/analytics";
import { popupStepFunnel, visitorFunnel } from "../models/funnel";
import { getFunnelCounts } from "../models/funnel.server";
import { buildChecklist, themeEditorUrl } from "../models/onboarding";

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

  /* The funnel cards: one campaign or all of them, over 7, 30 or
     90 days. The campaign id is checked against this shop's
     campaigns below. */
  const url = new URL(request.url);
  const funnelDays = normalizeDays(url.searchParams.get("funnelDays"));
  const funnelParam = url.searchParams.get("funnelCampaign") || "";

  /* The opt-in rate covers the last 30 days rather than all
     time. All time would keep quoting a number earned months
     ago long after the campaigns behind it were changed, which
     is the least useful version of this figure. */

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 29);

  const [campaigns, popups, events, setup] =
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
      db.popupEvent.groupBy({
        by: ["type"],
        where: {
          shop: session.shop,
          createdAt: { gte: since },
        },
        _count: { _all: true },
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

  const funnelCampaignId = campaigns.some((c) => c.id === funnelParam) ? funnelParam : null;
  const funnelCounts = await getFunnelCounts(session.shop, {
    campaignId: funnelCampaignId,
    days: funnelDays,
  });

  const eventTotals = emptyCounts();

  for (const row of events) {
    addCount(
      eventTotals,
      row.type,
      row._count._all,
    );
  }

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
      campaignId: funnelCampaignId,
      days: funnelDays,
      counts: funnelCounts,
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, live: c.status.toLowerCase() === "active" })),
    },

    optInRate: formatRate(
      conversionRate(
        eventTotals.view,
        eventTotals.submit,
      ),
    ),
    optInViews: eventTotals.view,

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
   METRIC TILE
   ============================================================ */

function MetricTile({
  label,
  value,
  caption,
  tone,
  available,
}: {
  label: string;
  value: string;
  caption: string;
  tone: "primary" | "success" | "accent" | "neutral";
  available: boolean;
}) {
  const valueColor = !available
    ? color.textSubtle
    : tone === "success"
      ? color.successText
      : tone === "accent"
        ? color.accentOnSubtle
        : color.textStrong;

  return (
    <div
      data-mq-reveal
      style={{
        ...card({ elevation: "raised" }),
        padding: space[7],
        display: "flex",
        flexDirection: "column",
        gap: space[3],
        minHeight: "124px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {available && (
        <span
          style={{
            position: "absolute",
            inset: "0 0 auto 0",
            height: "3px",
            background:
              tone === "success"
                ? color.successSolid
                : tone === "accent"
                  ? color.accent
                  : color.primary,
          }}
        />
      )}

      <span
        style={{
          ...text.bodySm,
          color: color.textMuted,
        }}
      >
        {label}
      </span>

      <span
        style={{
          ...text.display,
          fontSize: "28px",
          color: valueColor,
        }}
      >
        {value}
      </span>

      <span
        style={{
          ...text.caption,
          color: color.textSubtle,
        }}
      >
        {caption}
      </span>
    </div>
  );
}

/* ============================================================
   HOME
   ============================================================ */

export default function Index() {
  const {
    shop,
    setupSteps,
    funnel,
    optInRate,
    optInViews,
    campaignCount,
    liveCampaignCount,
    popupCount,
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

  const setFunnel = (key: "funnelCampaign" | "funnelDays", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  };

  const visitorSteps = visitorFunnel(funnel.counts);
  const popupSteps = popupStepFunnel(funnel.counts);
  const funnelScope = funnel.campaignId
    ? funnel.campaigns.find((c) => c.id === funnel.campaignId)?.name || "This campaign"
    : "All campaigns";

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
          METRIC TILES
      ===================================================== */}

      <div
        data-mq-stagger
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(232px, 1fr))",
          gap: space[5],
          marginBottom: space[5],
        }}
      >
        <MetricTile
          label="Live campaigns"
          value={String(liveCampaignCount)}
          caption={`${campaignCount} total campaign${
            campaignCount === 1 ? "" : "s"
          }`}
          tone="success"
          available
        />

        <MetricTile
          label="Live popups"
          value={String(livePopupCount)}
          caption={`${popupCount} total popup${
            popupCount === 1 ? "" : "s"
          }`}
          tone="primary"
          available
        />

        <MetricTile
          label="Opt-in rate"
          value={optInRate}
          caption={
            optInViews > 0
              ? `${optInViews} view${
                  optInViews === 1 ? "" : "s"
                } in the last 30 days`
              : "No views recorded yet"
          }
          tone="neutral"
          available={optInViews > 0}
        />

        <MetricTile
          label="Attributed revenue"
          value="—"
          caption="Needs order tracking"
          tone="neutral"
          available={false}
        />
      </div>

      {/* =====================================================
          CAMPAIGN FUNNELS
      ===================================================== */}

      <section
        aria-labelledby="mq-funnels-title"
        style={{ marginBottom: space[5] }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: space[5],
            flexWrap: "wrap",
            marginBottom: space[5],
          }}
        >
          <div>
            <h2
              id="mq-funnels-title"
              style={{ margin: 0, ...text.h3, color: color.textStrong }}
            >
              Campaign funnels
            </h2>
            <p style={{ margin: `${space[2]} 0 0`, ...text.bodySm, color: color.textMuted }}>
              {funnelScope} · last {funnel.days} days
            </p>
          </div>

          <div style={{ display: "flex", gap: space[3], flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: space[3], ...text.bodySm, color: color.textMuted }}>
              Campaign
              <select
                value={funnel.campaignId || ""}
                onChange={(event) => setFunnel("funnelCampaign", event.target.value)}
                style={{
                  ...input(),
                  width: "auto",
                  maxWidth: "260px",
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
              </select>
            </label>

            <div role="group" aria-label="Date range" style={{ display: "flex", gap: space[2] }}>
              {RANGES.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={funnel.days === d}
                  onClick={() => setFunnel("funnelDays", d === 30 ? "" : String(d))}
                  style={button(funnel.days === d ? "primary" : "secondary", "sm")}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="mq-grid-halves"
          aria-busy={funnelLoading}
          style={{ gap: space[5], opacity: funnelLoading ? 0.6 : 1, transition: "opacity 150ms" }}
        >
          <div style={{ ...card({ elevation: "raised" }), padding: space[7] }}>
            <h3 style={{ margin: 0, ...text.h4, color: color.textStrong }}>
              Visitor funnel
            </h3>
            <p style={{ margin: `${space[2]} 0 ${space[7]}`, ...text.bodySm, color: color.textMuted }}>
              How many shoppers saw the popup, and how many left their email or phone number.
            </p>
            <FunnelChart label="Visitor funnel" steps={visitorSteps} compare="first" />
            {funnel.counts.unflaggedSubmits > 0 ? (
              <p style={{ margin: `${space[6]} 0 0`, ...text.caption, color: color.textMuted }}>
                {funnel.counts.unflaggedSubmits} earlier signup
                {funnel.counts.unflaggedSubmits === 1 ? " is" : "s are"} not split into email and phone,
                because they came in before this was recorded.
              </p>
            ) : null}
          </div>

          <div style={{ ...card({ elevation: "raised" }), padding: space[7] }}>
            <h3 style={{ margin: 0, ...text.h4, color: color.textStrong }}>
              Popup steps
            </h3>
            <p style={{ margin: `${space[2]} 0 ${space[7]}`, ...text.bodySm, color: color.textMuted }}>
              How many shoppers reached each step of the popup, and the share that moved on from the step before.
            </p>
            <FunnelChart label="Popup steps" steps={popupSteps} compare="previous" />
            {funnel.counts.opens === 0 && funnel.counts.submits > 0 ? (
              <p style={{ margin: `${space[6]} 0 0`, ...text.caption, color: color.textMuted }}>
                Offer opens are counted from this update on, so older signups show no Step 2.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* =====================================================
          INSIGHTS + RUNNING NOW
      ===================================================== */}

      <div
        className="mq-grid-sidebar"
        style={{
          gap: space[5],
          marginBottom: space[5],
        }}
      >

        {/* ---------------- INSIGHTS ---------------- */}

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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: space[4],
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "26px",
                  height: "26px",
                  borderRadius: radius.md,
                  background: color.accentSubtle,
                  color: color.accentOnSubtle,
                  fontSize: "13px",
                  flexShrink: 0,
                }}
              >
                ✦
              </span>

              <h2
                style={{
                  margin: 0,
                  ...text.h3,
                  color: color.textStrong,
                }}
              >
                This week, from MQ Brain
              </h2>
            </div>

            <span style={badge("accent")}>
              NOT CONNECTED
            </span>
          </div>

          <div style={emptyState()}>
            <span
              style={{
                fontSize: "22px",
                color: color.textSubtle,
              }}
            >
              ✦
            </span>

            <strong
              style={{
                ...text.h4,
                color: color.textStrong,
              }}
            >
              No insights yet
            </strong>

            <p
              style={{
                margin: 0,
                maxWidth: "420px",
                ...text.body,
                color: color.textMuted,
              }}
            >
              Weekly recommendations appear once
              campaigns start collecting impression
              and conversion data from your
              storefront.
            </p>
          </div>
        </div>

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
              All campaigns →
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

      {/* =====================================================
          LIVE ACTIVITY
      ===================================================== */}

      <div
        data-mq-reveal
        style={{
          ...card({ elevation: "raised" }),
          marginBottom: space[7],
        }}
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
            Live activity
          </h2>

          <span style={badge("neutral")}>
            NO EVENT DATA
          </span>
        </div>

        <div
          style={{
            ...emptyState(),
            minHeight: "180px",
          }}
        >
          <strong
            style={{
              ...text.h4,
              color: color.textStrong,
            }}
          >
            Nothing to show yet
          </strong>

          <p
            style={{
              margin: 0,
              maxWidth: "480px",
              ...text.body,
              color: color.textMuted,
            }}
          >
            Signups, orders and recovered carts will
            stream here once popups are rendering on
            your storefront and events are being
            recorded.
          </p>
        </div>
      </div>

      {/* =====================================================
          FOOTNOTE
      ===================================================== */}

      <p
        style={{
          margin: `0 0 ${space[7]}`,
          ...text.bodySm,
          color: color.textSubtle,
        }}
      >
        Campaign and popup counts are live from your
        database. Revenue, opt-in and activity metrics
        stay empty until storefront tracking is in
        place.
      </p>

    </s-page>
  );
}

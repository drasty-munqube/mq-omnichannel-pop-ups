import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";
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
  emptyState,
  eyebrow,
  interactive,
  pageSubtitle,
  pageTitle,
} from "../design/styles";
import { useScrollReveal } from "../design/useScrollReveal";

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

  const [campaigns, popups] = await Promise.all([
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
  ]);

  const liveCampaigns = campaigns.filter(
    (campaign) =>
      campaign.status.toLowerCase() === "active",
  );

  const livePopups = popups.filter(
    (popup) =>
      popup.status.toLowerCase() === "active",
  );

  return {
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
    campaignCount,
    liveCampaignCount,
    popupCount,
    livePopupCount,
    runningNow,
    recentDrafts,
    popupNames,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();

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
          value="—"
          caption="Needs conversion tracking"
          tone="neutral"
          available={false}
        />

        <MetricTile
          label="Attributed revenue"
          value="—"
          caption="Needs conversion tracking"
          tone="neutral"
          available={false}
        />
      </div>

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

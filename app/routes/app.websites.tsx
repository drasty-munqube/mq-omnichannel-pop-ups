import { useState } from "react";

import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import {
  buildSnippet,
  CodeBlock,
  CopyButton,
} from "../components/copy-snippet";
import db from "../db.server";
import {
  createSite,
  deleteSite,
  ensureShopifySite,
  listSites,
  updateSite,
} from "../models/site.server";
import { authenticate } from "../shopify.server";

/* ============================================================
   WEBSITES

   One place that answers "which campaign runs where".

   Before site targeting existed, every website carrying the
   embed snippet received every live campaign, because the only
   thing the widget identified was the shop. This screen is the
   other half of the fix: the merchant registers the websites
   they run campaigns on, and each campaign says whether it
   runs everywhere or only on chosen sites.

   Websites also appear here on their own. The public widget
   endpoint records the hostname it was called from, so a site
   the merchant pasted the snippet on shows up as "Detected"
   without anyone adding it by hand.
   ============================================================ */

type CampaignSummary = {
  id: string;
  name: string;
  status: string;
  everywhere: boolean;
};

/* ------------------------------------------------------------
   Shared with the widget: a campaign runs on a site when it is
   not scoped, or when that site is in its chosen list.
   ------------------------------------------------------------ */

function runsOnSite(
  campaign: {
    siteTargetMode: string;
    siteTargets: unknown;
  },
  siteId: string,
) {
  if (campaign.siteTargetMode !== "selected") {
    return true;
  }

  const targets = Array.isArray(
    campaign.siteTargets,
  )
    ? (campaign.siteTargets as string[])
    : [];

  return targets.includes(siteId);
}

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const { session } =
    await authenticate.admin(request);

  // Guarantees the storefront row exists before we map, so a
  // shop that installed before this feature still sees it.
  await ensureShopifySite(session.shop);

  const [sites, campaigns] = await Promise.all([
    listSites(session.shop),
    db.campaign.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        popupId: true,
        siteTargetMode: true,
        siteTargets: true,
      },
    }),
  ]);

  const appUrl = (
    process.env.SHOPIFY_APP_URL ||
    new URL(request.url).origin
  ).replace(/\/+$/, "");

  /* Only campaigns that could actually fire are worth showing
     in the map. A campaign with no popup attached never
     renders anything, so counting it here would be a lie. */

  const runnable = campaigns.filter(
    (campaign) => Boolean(campaign.popupId),
  );

  const mapping = sites.map((site) => ({
    ...site,
    lastSeenAt: site.lastSeenAt
      ? site.lastSeenAt.toISOString()
      : null,
    createdAt: site.createdAt.toISOString(),
    campaigns: runnable
      .filter((campaign) =>
        runsOnSite(campaign, site.id),
      )
      .map(
        (campaign): CampaignSummary => ({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          everywhere:
            campaign.siteTargetMode !==
            "selected",
        }),
      ),
  }));

  /* A campaign scoped to "selected" with nothing selected runs
     nowhere at all. That is almost always a mistake, so it is
     surfaced rather than left silent. */

  const orphaned = runnable
    .filter(
      (campaign) =>
        campaign.siteTargetMode === "selected" &&
        (!Array.isArray(campaign.siteTargets) ||
          (campaign.siteTargets as string[])
            .length === 0),
    )
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
    }));

  return {
    shop: session.shop,
    appUrl,
    sites: mapping,
    orphaned,
  };
}

/* ============================================================
   ACTION
   ============================================================ */

export async function action({
  request,
}: ActionFunctionArgs) {
  const { session } =
    await authenticate.admin(request);

  const formData = await request.formData();
  const intent = String(
    formData.get("intent") || "",
  );

  if (intent === "create") {
    const result = await createSite(
      session.shop,
      {
        name: String(
          formData.get("name") || "",
        ),
        domain: String(
          formData.get("domain") || "",
        ),
      },
    );

    return result.ok
      ? { ok: true, error: null }
      : { ok: false, error: result.error };
  }

  if (intent === "update") {
    const result = await updateSite(
      session.shop,
      String(formData.get("id") || ""),
      {
        name: String(
          formData.get("name") || "",
        ),
        domain: String(
          formData.get("domain") || "",
        ),
      },
    );

    return result.ok
      ? { ok: true, error: null }
      : { ok: false, error: result.error };
  }

  if (intent === "delete") {
    const result = await deleteSite(
      session.shop,
      String(formData.get("id") || ""),
    );

    return result.ok
      ? { ok: true, error: null }
      : { ok: false, error: result.error };
  }

  return {
    ok: false,
    error: "Unknown action.",
  };
}

/* ============================================================
   SMALL PIECES
   ============================================================ */

function Badge({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "live" | "info";
}) {
  const palette = {
    neutral: {
      color: "#4B5563",
      background: "#F3F4F6",
    },
    live: {
      color: "#0A6E4A",
      background: "#D9F2E6",
    },
    info: {
      color: "#1D4ED8",
      background: "#E0E7FF",
    },
  }[tone];

  return (
    <span
      style={{
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 999,
        whiteSpace: "nowrap",
        ...palette,
      }}
    >
      {text}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  color: "#111827",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  minWidth: 0,
  width: "100%",
};

const subtleButton: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  cursor: "pointer",
};

/* ============================================================
   ONE WEBSITE
   ============================================================ */

function SiteCard({
  site,
  snippet,
  busy,
}: {
  site: {
    id: string;
    name: string;
    domain: string;
    kind: string;
    autoAdded: boolean;
    lastSeenAt: string | null;
    campaigns: CampaignSummary[];
  };
  snippet: string;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] =
    useState(false);

  const isShopify = site.kind === "shopify";

  const live = site.campaigns.filter(
    (campaign) => campaign.status === "active",
  );

  return (
    <div
      style={{
        padding: 16,
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        background: "#FFFFFF",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#111827",
              }}
            >
              {site.name}
            </span>

            {isShopify && (
              <Badge
                text="Shopify storefront"
                tone="info"
              />
            )}

            {site.autoAdded && (
              <Badge text="Detected" />
            )}
          </div>

          <div
            style={{
              marginTop: 2,
              fontSize: 13,
              color: "#6B7280",
              wordBreak: "break-all",
            }}
          >
            {site.domain}
          </div>
        </div>

        {!isShopify && (
          <div
            style={{
              display: "flex",
              gap: 8,
            }}
          >
            <button
              type="button"
              style={subtleButton}
              onClick={() =>
                setEditing((value) => !value)
              }
            >
              {editing ? "Cancel" : "Edit"}
            </button>

            {confirming ? (
              <Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="delete"
                />
                <input
                  type="hidden"
                  name="id"
                  value={site.id}
                />
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    ...subtleButton,
                    color: "#B42318",
                    borderColor: "#F3C6C0",
                    background: "#FEF3F2",
                  }}
                >
                  Confirm remove
                </button>
              </Form>
            ) : (
              <button
                type="button"
                style={subtleButton}
                onClick={() =>
                  setConfirming(true)
                }
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      {editing && !isShopify && (
        <Form
          method="post"
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            flexWrap: "wrap",
          }}
          onSubmit={() => setEditing(false)}
        >
          <input
            type="hidden"
            name="intent"
            value="update"
          />
          <input
            type="hidden"
            name="id"
            value={site.id}
          />

          <input
            name="name"
            defaultValue={site.name}
            placeholder="Name"
            style={{
              ...inputStyle,
              flex: "1 1 180px",
            }}
          />
          <input
            name="domain"
            defaultValue={site.domain}
            placeholder="example.com"
            style={{
              ...inputStyle,
              flex: "1 1 220px",
            }}
          />

          <button
            type="submit"
            disabled={busy}
            style={{
              ...subtleButton,
              color: "#FFFFFF",
              background: "#1F2937",
              borderColor: "#1F2937",
            }}
          >
            Save
          </button>
        </Form>
      )}

      {/* ---------- what runs here ---------- */}

      <div style={{ marginTop: 14 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#6B7280",
            textTransform: "uppercase",
            letterSpacing: 0.4,
            marginBottom: 8,
          }}
        >
          Campaigns running here
        </div>

        {live.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: "#6B7280",
            }}
          >
            No live campaign runs on this website
            yet.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {live.map((campaign) => (
              <div
                key={campaign.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  color: "#111827",
                  flexWrap: "wrap",
                }}
              >
                <span>{campaign.name}</span>
                {campaign.everywhere ? (
                  <Badge text="All websites" />
                ) : (
                  <Badge
                    text="This website only"
                    tone="live"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- snippet ---------- */}

      <div style={{ marginTop: 16 }}>
        {isShopify ? (
          <div
            style={{
              fontSize: 13,
              color: "#6B7280",
              lineHeight: 1.6,
            }}
          >
            This storefront does not need the
            snippet. It uses the theme app embed,
            which you turn on under Online Store,
            Themes, Customize, App embeds.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: 12,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#6B7280",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                Snippet for this website
              </div>

              <CopyButton value={snippet} />
            </div>

            <CodeBlock code={snippet} />

            {site.lastSeenAt && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#6B7280",
                }}
              >
                Last request from this website:{" "}
                {new Date(
                  site.lastSeenAt,
                ).toLocaleString("en-IN")}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   WEBSITES SCREEN
   ============================================================ */

export default function Websites() {
  const { shop, appUrl, sites, orphaned } =
    useLoaderData<typeof loader>();

  const actionData =
    useActionData<typeof action>();

  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const snippet = buildSnippet(appUrl, shop);

  const externalCount = sites.filter(
    (site) => site.kind !== "shopify",
  ).length;

  return (
    <s-page
      heading="Websites"
      inlineSize="large"
    >
      {/* ---------- intro + add ---------- */}

      <s-section>
        <s-paragraph>
          Every website you paste the snippet on
          shows up here. Use this screen to see
          what is running where, and open a
          campaign to scope it to one website
          instead of all of them.
        </s-paragraph>

        <Form
          method="post"
          style={{
            display: "flex",
            gap: 8,
            marginTop: 14,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            type="hidden"
            name="intent"
            value="create"
          />

          <input
            name="name"
            placeholder="Name, for example Marketing blog"
            style={{
              ...inputStyle,
              flex: "1 1 220px",
            }}
          />
          <input
            name="domain"
            placeholder="example.com"
            required
            style={{
              ...inputStyle,
              flex: "1 1 220px",
            }}
          />

          <button
            type="submit"
            disabled={busy}
            style={{
              ...subtleButton,
              color: "#FFFFFF",
              background: "#1F2937",
              borderColor: "#1F2937",
            }}
          >
            Add website
          </button>
        </Form>

        {actionData?.error && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              fontSize: 13,
              color: "#B42318",
              background: "#FEF3F2",
              border: "1px solid #F3C6C0",
              borderRadius: 8,
            }}
          >
            {actionData.error}
          </div>
        )}

        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: "#6B7280",
          }}
        >
          {externalCount === 0
            ? "No external website added yet."
            : `${externalCount} external website${
                externalCount === 1 ? "" : "s"
              } plus your Shopify storefront.`}
        </div>
      </s-section>

      {/* ---------- campaigns that run nowhere ---------- */}

      {orphaned.length > 0 && (
        <s-section heading="Campaigns with no website">
          <s-paragraph>
            These campaigns are scoped to selected
            websites but none are selected, so
            they will not appear anywhere. Open
            each one and either pick a website or
            set it back to all websites.
          </s-paragraph>

          <s-unordered-list>
            {orphaned.map((campaign) => (
              <s-list-item key={campaign.id}>
                {campaign.name}
                {campaign.status === "active"
                  ? " (live)"
                  : " (draft)"}
              </s-list-item>
            ))}
          </s-unordered-list>

          <div style={{ marginTop: 8 }}>
            <Link to="/app/campaigns">
              Open campaigns
            </Link>
          </div>
        </s-section>
      )}

      {/* ---------- the map ---------- */}

      <s-section heading="Where your campaigns run">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {sites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              snippet={snippet}
              busy={busy}
            />
          ))}
        </div>
      </s-section>
    </s-page>
  );
}

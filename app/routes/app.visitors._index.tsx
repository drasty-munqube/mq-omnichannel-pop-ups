/* ============================================================
   VISITORS  (GET /app/visitors)

   Everyone who came to the store while the MQ app embed was on,
   signed up or not: which device and browser, where they came
   from, which pages they viewed, and what they did with the
   popup (shown, clicked, closed, signed up). Each row opens that
   visitor's page with their full timeline
   (app.visitors.$visitorId.tsx).

   GET ?filter=&q=&page=   filtered, paginated list

   On the storefront, visits are only recorded when the shopper
   allows analytics (Shopify's cookie banner), so the numbers can
   be lower than Shopify's own traffic reports.
   ============================================================ */

import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useNavigate, useNavigation } from "react-router";

import { AuditDate, stickyEnd } from "../components/audit-cells";
import { RowActions } from "../components/row-actions";
import { badge, button, card, input, tableHead, tableRow } from "../design/styles";
import { color, fontFamily, fontWeight, space, text } from "../design/tokens";
import {
  VISITOR_FILTERS,
  VISITOR_PAGE_SIZE,
  arrivedFrom,
  deviceLine,
  isVisitorFilter,
  pathOf,
  shortId,
  visitorPath,
  type VisitorFilterKey,
} from "../models/visitor-list";
import { listVisitors, visitorSummary } from "../models/visitor-list.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const filterParam = url.searchParams.get("filter");
  const filter: VisitorFilterKey = isVisitorFilter(filterParam) ? filterParam : "all";
  const q = (url.searchParams.get("q") || "").slice(0, 200);
  const page = Math.max(1, Math.min(10_000, Number(url.searchParams.get("page")) || 1));

  try {
    const [list, summary] = await Promise.all([listVisitors(session.shop, { filter, q, page }), visitorSummary(session.shop)]);
    return { ...list, summary, filter, q, page, loadError: false };
  } catch (error) {
    console.error("VISITORS ERROR:", error);
    return { total: 0, rows: [], summary: null, filter, q, page, loadError: true };
  }
}

const COLUMNS = "minmax(200px, 1.4fr) minmax(210px, 1.3fr) minmax(150px, 1fr) minmax(120px, 0.8fr) 120px 72px";

function hrefFor(filter: VisitorFilterKey, q: string, page = 1) {
  const p = new URLSearchParams();
  if (filter !== "all") p.set("filter", filter);
  if (q) p.set("q", q);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/app/visitors?${s}` : "/app/visitors";
}

function Tile({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <div style={{ ...card({ elevation: "raised" }), padding: space[6], display: "grid", gap: space[2] }}>
      <span style={{ ...text.bodySm, color: color.textMuted }}>{label}</span>
      <span style={{ ...text.display, fontSize: "24px", color: color.textStrong }}>{value.toLocaleString()}</span>
      <span style={{ ...text.caption, color: color.textSubtle }}>{caption}</span>
    </div>
  );
}

function Count({ n, label, strong }: { n: number; label: string; strong?: boolean }) {
  return (
    <span style={{ whiteSpace: "nowrap", color: n ? (strong ? color.textStrong : color.text) : color.textSubtle, fontWeight: strong && n ? fontWeight.semibold : undefined }}>
      {n} {label}
    </span>
  );
}

export default function VisitorsPage() {
  const { rows, total, summary, filter, q, page, loadError } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const opening = navigation.state === "loading" && Boolean(navigation.location?.pathname.startsWith("/app/visitors/"));
  const pages = Math.max(1, Math.ceil(total / VISITOR_PAGE_SIZE));

  return (
    <s-page heading="Visitors" inlineSize="large">
      <s-section>
        <p style={{ margin: `0 0 ${space[5]}`, ...text.body, color: color.textMuted }}>
          Everyone who visited your store with MQ Pop-ups on, and what they did with your popups. Shoppers stay anonymous until they sign up.
        </p>

        {summary ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: space[4], marginBottom: space[6] }}>
            <Tile label="Visitors" value={summary.active} caption="Last 7 days" />
            <Tile label="New visitors" value={summary.newVisitors} caption="First visit in the last 7 days" />
            <Tile label="Popups shown" value={summary.popupsShown} caption="Last 7 days" />
            <Tile label="Popup clicks" value={summary.clicks} caption="Last 7 days" />
            <Tile label="Signups" value={summary.signups} caption={`${summary.identified} visitor${summary.identified === 1 ? "" : "s"} identified`} />
          </div>
        ) : null}

        <div style={{ display: "flex", gap: space[4], flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: space[5] }}>
          <nav aria-label="Filter visitors" style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
            {VISITOR_FILTERS.map((f) => (
              <Link
                key={f.key}
                to={hrefFor(f.key, q)}
                aria-current={filter === f.key ? "page" : undefined}
                style={{ ...button(filter === f.key ? "primary" : "secondary", "sm"), textDecoration: "none" }}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <Form method="get" role="search" style={{ display: "flex", gap: space[3], flex: "1 1 220px", maxWidth: "380px" }}>
            {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search by email, phone or visitor id"
              aria-label="Search visitors"
              style={{ ...input(), flex: 1, minWidth: 0 }}
            />
            <button type="submit" style={button("secondary", "md")}>
              Search
            </button>
          </Form>
        </div>

        {loadError ? (
          <p style={{ ...text.body, color: color.dangerText }}>Visitors could not be loaded. Please refresh the page.</p>
        ) : rows.length === 0 ? (
          <div style={{ padding: `${space[9]} ${space[6]}`, textAlign: "center", border: `1px dashed ${color.borderStrong}`, borderRadius: "12px" }}>
            <div style={{ ...text.h4, color: color.textStrong }}>{filter === "all" && !q ? "No visitors yet" : "No visitors match"}</div>
            <div style={{ ...text.body, color: color.textMuted, marginTop: space[3] }}>
              {filter === "all" && !q
                ? "Turn on the MQ Pop-ups app embed in your theme. Visitors show up here as soon as someone opens your store."
                : "Try another filter or search."}
            </div>
          </div>
        ) : (
          <div
            aria-busy={opening}
            style={{ overflowX: "auto", border: `1px solid ${color.border}`, borderRadius: "12px", opacity: opening ? 0.6 : 1, transition: "opacity 150ms" }}
          >
            <div style={{ minWidth: "980px" }}>
              <div style={tableHead(COLUMNS)}>
                <span>Visitor</span>
                <span>Activity</span>
                <span>Device</span>
                <span>Came from</span>
                <span>Last seen</span>
                <span style={stickyEnd(color.surfaceSunken)}>Actions</span>
              </div>
              {rows.map((row) => {
                const name = row.contact?.email || row.contact?.phone || `Visitor ${shortId(row.anonymousId)}`;
                return (
                  <div key={row.id} style={tableRow(COLUMNS)}>
                    <div style={{ minWidth: 0 }}>
                      <Link
                        to={visitorPath(row.id)}
                        title={name}
                        style={{
                          display: "block",
                          ...text.body,
                          fontWeight: fontWeight.semibold,
                          color: color.textStrong,
                          textDecoration: "none",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontFamily: row.contact ? undefined : fontFamily.mono,
                          fontSize: row.contact ? undefined : "13px",
                        }}
                      >
                        {name}
                      </Link>
                      <div style={{ display: "flex", gap: space[2], flexWrap: "wrap", marginTop: space[2] }}>
                        <span style={badge(row.contact ? "success" : "neutral")}>{row.contact ? "SIGNED UP" : "ANONYMOUS"}</span>
                        {row.loggedIn ? <span style={badge("accent")}>LOGGED IN</span> : null}
                        <span style={badge("neutral")}>{row.source === "shopify" ? "STOREFRONT" : "WEBSITE"}</span>
                      </div>
                    </div>
                    <div style={{ ...text.bodySm, display: "flex", flexWrap: "wrap", columnGap: space[4], rowGap: space[1] }}>
                      <Count n={row.counts.pageViews} label={row.counts.pageViews === 1 ? "page" : "pages"} />
                      <Count n={row.counts.popupsShown} label="shown" />
                      <Count n={row.counts.clicks} label={row.counts.clicks === 1 ? "click" : "clicks"} strong />
                      <Count n={row.counts.closes} label="closed" />
                      <Count n={row.counts.signups} label={row.counts.signups === 1 ? "signup" : "signups"} strong />
                    </div>
                    <div style={{ minWidth: 0, ...text.bodySm, color: color.text }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deviceLine(row) || "Unknown"}</div>
                      {row.lastPageUrl ? (
                        <div title={row.lastPageUrl} style={{ color: color.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {pathOf(row.lastPageUrl)}
                        </div>
                      ) : null}
                    </div>
                    <div title={row.referrer || undefined} style={{ minWidth: 0, ...text.bodySm, color: color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {arrivedFrom(row)}
                    </div>
                    <AuditDate value={row.lastSeenAt} />
                    <div style={stickyEnd(color.surface)}>
                      <RowActions name={name} actions={[{ label: "View visitor", onSelect: () => navigate(visitorPath(row.id)) }]} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pages > 1 ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space[4], marginTop: space[5], flexWrap: "wrap" }}>
            <span style={{ ...text.bodySm, color: color.textMuted }}>
              Page {page} of {pages} · {total.toLocaleString()} visitors
            </span>
            <div style={{ display: "flex", gap: space[3] }}>
              {page > 1 ? (
                <Link to={hrefFor(filter, q, page - 1)} style={{ ...button("secondary", "sm"), textDecoration: "none" }}>
                  Previous
                </Link>
              ) : null}
              {page < pages ? (
                <Link to={hrefFor(filter, q, page + 1)} style={{ ...button("secondary", "sm"), textDecoration: "none" }}>
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </s-section>
    </s-page>
  );
}

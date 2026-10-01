/* ============================================================
   PEOPLE LIST (Contacts page)

   One list for everyone: contacts (signed up) and anonymous
   visitors, most recently active first. A contact is one row even
   when they used several devices; their visits are added up on
   it. Filters: All, Signed up, Anonymous, Logged in. Search by
   email, phone, visitor id or Shopify customer id.

   Contacts open their Journey; anonymous visitors open their
   visitor page (app.visitors.$visitorId.tsx).
   ============================================================ */

import { Form, Link, useNavigate, useNavigation } from "react-router";
import { Activity, ChevronLeft, ChevronRight, MousePointerClick, Search, UserX, Users, type LucideIcon } from "lucide-react";

import { AuditDate, stickyEnd } from "./audit-cells";
import { StatIcon } from "./analytics-charts";
import { RowActions } from "./row-actions";
import { badge, button, card, input, tableHead, tableRow } from "../design/styles";
import { color, fontFamily, fontWeight, layout, space, text } from "../design/tokens";
import { PEOPLE_FILTERS, PEOPLE_PAGE_SIZE, type PeopleFilterKey } from "../models/people";
import type { PeoplePageData, PersonRow } from "../models/people.server";
import { arrivedFrom, deviceLine, shortId, visitorPath } from "../models/visitor-list";
import { IconButton } from "./icon-button";
import { SearchField } from "./search-field";

const COLUMNS = "minmax(230px, 1.6fr) minmax(200px, 1.2fr) minmax(140px, 0.9fr) minmax(110px, 0.7fr) 120px 64px";

export function peopleHref(filter: PeopleFilterKey, q: string, page = 1) {
  const p = new URLSearchParams();
  if (filter !== "all") p.set("filter", filter);
  if (q) p.set("q", q);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/app/contacts?${s}` : "/app/contacts";
}

function Tile({ label, value, caption, icon }: { label: string; value: number; caption: string; icon: LucideIcon }) {
  return (
    <div style={{ ...card({ elevation: "raised" }), padding: space[6], display: "grid", gap: space[2] }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space[4] }}>
        <span style={{ ...text.bodySm, color: color.textMuted }}>{label}</span>
        <StatIcon icon={icon} />
      </span>
      <span style={{ ...text.display, fontSize: "24px", color: color.textStrong }}>{value.toLocaleString()}</span>
      <span style={{ ...text.caption, color: color.textSubtle }}>{caption}</span>
    </div>
  );
}

function Count({ n, label, strong }: { n: number; label: string; strong?: boolean }) {
  return (
    <span
      style={{
        whiteSpace: "nowrap",
        color: n ? (strong ? color.textStrong : color.text) : color.textSubtle,
        fontWeight: strong && n ? fontWeight.semibold : undefined,
      }}
    >
      {n} {label}
    </span>
  );
}

function personName(row: PersonRow) {
  if (row.kind === "contact") return row.email || row.phone || "No email captured";
  return `Visitor ${row.anonymousId ? shortId(row.anonymousId) : ""}`;
}

export function PeopleList({
  data,
  onOpenJourney,
}: {
  data: PeoplePageData;
  onOpenJourney: (contact: { id: string; title: string }) => void;
}) {
  const { rows, total, summary, contactTotal, anonymousTotal, filter, q, page, loadError } = data;
  const navigate = useNavigate();
  const navigation = useNavigation();
  const busy = navigation.state === "loading";
  const pages = Math.max(1, Math.ceil(total / PEOPLE_PAGE_SIZE));

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: space[4], marginBottom: space[6] }}>
        <Tile icon={Users} label="Contacts" value={contactTotal} caption="Signed up, all time" />
        <Tile icon={UserX} label="Anonymous visitors" value={anonymousTotal} caption="Visited, not signed up yet" />
        <Tile icon={Activity} label="Active visitors" value={summary?.active ?? 0} caption="Last 7 days" />
        <Tile icon={MousePointerClick} label="Popup clicks" value={summary?.clicks ?? 0} caption="Last 7 days" />
      </div>

      <div style={{ display: "flex", gap: space[4], flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: space[5] }}>
        <nav aria-label="Filter people" style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
          {PEOPLE_FILTERS.map((f) => (
            <Link
              key={f.key}
              to={peopleHref(f.key, q)}
              aria-current={filter === f.key ? "page" : undefined}
              style={{ ...button(filter === f.key ? "primary" : "secondary", "sm"), textDecoration: "none" }}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <Form method="get" action="/app/contacts" role="search" style={{ display: "flex", gap: space[3], flex: "1 1 220px", maxWidth: "380px" }}>
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <SearchField
            name="q"
            defaultValue={q}
            placeholder="Search by email, phone or visitor id"
            aria-label="Search contacts and visitors"
            style={{ ...input(), flex: 1, minWidth: 0 }}
          />
          <IconButton type="submit" icon={Search} label="Search" />
        </Form>
      </div>

      {loadError ? (
        <p style={{ ...text.body, color: color.dangerText }}>This list could not be loaded. Please refresh the page.</p>
      ) : rows.length === 0 ? (
        <div style={{ padding: `${space[9]} ${space[6]}`, textAlign: "center", border: `1px dashed ${color.borderStrong}`, borderRadius: "12px" }}>
          <div style={{ ...text.h4, color: color.textStrong }}>{filter === "all" && !q ? "Nobody here yet" : "Nobody matches"}</div>
          <div style={{ ...text.body, color: color.textMuted, marginTop: space[3] }}>
            {filter === "all" && !q
              ? "Turn on the MQ Pop-ups app embed in your theme. Visitors show up as soon as someone opens your store, and become contacts when they sign up."
              : "Try another filter or search."}
          </div>
        </div>
      ) : (
        <div
          aria-busy={busy}
          style={{ overflowX: "auto", border: `1px solid ${color.border}`, borderRadius: "12px", opacity: busy ? 0.6 : 1, transition: "opacity 150ms" }}
        >
          <div style={{ minWidth: "1000px" }}>
            <div style={tableHead(COLUMNS)}>
              <span>Person</span>
              <span>Activity</span>
              <span>Device</span>
              <span>Came from</span>
              <span>Last active</span>
              <span style={stickyEnd(color.surfaceSunken)}>Actions</span>
            </div>
            {rows.map((row) => {
              const name = personName(row);
              const isContact = row.kind === "contact";
              const openJourney = () => onOpenJourney({ id: row.id, title: name });
              const actions = isContact
                ? [
                    { label: "View journey", onSelect: openJourney },
                    ...(row.visitorId ? [{ label: "View latest visit", onSelect: () => navigate(visitorPath(row.visitorId as string)) }] : []),
                  ]
                : [{ label: "View visitor", onSelect: () => navigate(visitorPath(row.id)) }];
              const nameStyle = {
                display: "block",
                maxWidth: "100%",
                padding: 0,
                border: 0,
                background: "transparent",
                cursor: "pointer",
                textAlign: "left" as const,
                ...text.body,
                fontWeight: fontWeight.semibold,
                color: color.textStrong,
                textDecoration: "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" as const,
                fontFamily: isContact ? undefined : fontFamily.mono,
                fontSize: isContact ? undefined : "13px",
              };
              return (
                <div key={row.key} style={tableRow(COLUMNS)}>
                  <div style={{ minWidth: 0 }}>
                    {isContact ? (
                      <button type="button" onClick={openJourney} title={name} style={nameStyle}>
                        {name}
                      </button>
                    ) : (
                      <Link to={visitorPath(row.id)} title={name} style={nameStyle}>
                        {name}
                      </Link>
                    )}
                    <div style={{ display: "flex", gap: space[2], flexWrap: "wrap", alignItems: "center", marginTop: space[2] }}>
                      <span style={badge(isContact ? "success" : "neutral")}>{isContact ? "SIGNED UP" : "ANONYMOUS"}</span>
                      {row.loggedIn ? <span style={badge("accent")}>LOGGED IN</span> : null}
                      {row.devices > 1 ? <span style={badge("info")}>{row.devices} DEVICES</span> : null}
                    </div>
                    {isContact && (row.extra || row.popupName) ? (
                      <div
                        style={{ ...text.caption, color: color.textMuted, marginTop: space[2], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {[row.extra, row.popupName ? `via ${row.popupName}` : ""].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ ...text.bodySm, display: "flex", flexWrap: "wrap", columnGap: space[4], rowGap: space[1] }}>
                    <Count n={row.counts.pageViews} label={row.counts.pageViews === 1 ? "page" : "pages"} />
                    <Count n={row.counts.popupsShown} label="shown" />
                    <Count n={row.counts.clicks} label={row.counts.clicks === 1 ? "click" : "clicks"} strong />
                    <Count n={row.counts.signups} label={row.counts.signups === 1 ? "signup" : "signups"} strong />
                  </div>
                  <div style={{ minWidth: 0, ...text.bodySm, color: color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.visitorId ? deviceLine(row) || "Unknown" : <span style={{ color: color.textSubtle }}>Before tracking</span>}
                  </div>
                  <div
                    title={row.referrer || undefined}
                    style={{ minWidth: 0, ...text.bodySm, color: color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {row.visitorId ? arrivedFrom(row) : <span style={{ color: color.textSubtle }}>—</span>}
                  </div>
                  <AuditDate value={row.lastActiveAt} />
                  <div style={stickyEnd(color.surface)}>
                    <RowActions name={name} actions={actions} />
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
            Page {page} of {pages} · {total.toLocaleString()} people
          </span>
          <div style={{ display: "flex", gap: space[3] }}>
            {page > 1 ? (
              <Link to={peopleHref(filter, q, page - 1)} aria-label="Previous page" title="Previous page" style={{ ...button("secondary", "sm"), width: layout.controlSm, boxSizing: "border-box", padding: 0, textDecoration: "none" }}>
                <ChevronLeft aria-hidden size={16} strokeWidth={2} />
              </Link>
            ) : null}
            {page < pages ? (
              <Link to={peopleHref(filter, q, page + 1)} aria-label="Next page" title="Next page" style={{ ...button("secondary", "sm"), width: layout.controlSm, boxSizing: "border-box", padding: 0, textDecoration: "none" }}>
                <ChevronRight aria-hidden size={16} strokeWidth={2} />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

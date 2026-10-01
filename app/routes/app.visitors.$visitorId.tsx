/* ============================================================
   VISITOR  (GET /app/visitors/:visitorId)

   One visitor's page: device, browser, where they came from, the
   contact they became (if they signed up), and every event in
   time order, newest first: page views, popups shown, what they
   clicked in the popup, closes and signups.
   ============================================================ */

import { useEffect, useState, type ReactNode } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";

import { AuditDate } from "../components/audit-cells";
import { ContactJourneyDialog } from "../components/contact-journey";
import { CopyButton } from "../components/copy-snippet";
import { Breadcrumbs } from "../components/domain-ui";
import { RefLink } from "../components/ref-link";
import { badge, button, card } from "../design/styles";
import { color, fontFamily, fontWeight, layout, radius, space, text } from "../design/tokens";
import { eventLabel } from "../models/journey-events";
import { arrivedFrom, deviceLine, shortId } from "../models/visitor-list";
import { getVisitorDetail } from "../models/visitor-list.server";
import { authenticate } from "../shopify.server";
import { ArrowLeft, Route } from "lucide-react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  try {
    const detail = await getVisitorDetail(session.shop, String(params.visitorId || ""));
    return { detail, loadError: false };
  } catch (error) {
    console.error("VISITOR DETAIL ERROR:", error);
    return { detail: null, loadError: true };
  }
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt style={{ color: color.textMuted }}>{label}</dt>
      <dd style={{ margin: 0, color: color.textStrong, minWidth: 0, overflowWrap: "anywhere" }}>{children}</dd>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: `${space[5]} ${space[6]}`, borderRadius: radius.md, background: color.surfaceSunken, display: "grid", gap: space[1] }}>
      <span style={{ ...text.caption, color: color.textMuted }}>{label}</span>
      <span style={{ ...text.h3, color: color.textStrong }}>{value}</span>
    </div>
  );
}

/* Day headings follow the viewer's time zone after mount; the
   server render uses UTC so hydration matches. */
function useDayLabel() {
  const [tz, setTz] = useState<string | undefined>("UTC");
  useEffect(() => setTz(undefined), []);
  return (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: tz });
}

export default function VisitorPage() {
  const { detail, loadError } = useLoaderData<typeof loader>();
  const [journeyOpen, setJourneyOpen] = useState(false);
  const dayLabel = useDayLabel();
  const crumbs = (label: string) => <Breadcrumbs items={[{ label: "Contacts", to: "/app/contacts" }, { label }]} />;

  if (loadError || !detail) {
    return (
      <s-page heading="Contacts" inlineSize="large">
        <s-section>
          {crumbs("Visitor")}
          <div style={{ padding: `${space[10]} ${space[6]}`, textAlign: "center", border: `1px dashed ${color.borderStrong}`, borderRadius: "12px" }}>
            <div style={{ ...text.h4, color: color.textStrong }}>{loadError ? "This visitor could not be loaded" : "Visitor not found"}</div>
            <p style={{ margin: `${space[3]} 0 ${space[6]}`, ...text.body, color: color.textMuted }}>
              {loadError ? "Please refresh the page." : "They may have been erased, or they belong to another store."}
            </p>
            <Link to="/app/contacts" style={{ ...button("secondary", "md"), textDecoration: "none" }}>
              <ArrowLeft aria-hidden size={15} strokeWidth={2} />
              Back to Contacts
            </Link>
          </div>
        </s-section>
      </s-page>
    );
  }

  const { visitor: v, contact, counts, events, truncated } = detail;
  const name = contact?.email || contact?.phone || `Visitor ${shortId(v.anonymousId)}`;
  const utm = [v.utmSource, v.utmMedium, v.utmCampaign, v.utmTerm, v.utmContent].filter(Boolean).join(" / ");

  let lastDay = "";

  return (
    <s-page heading="Contacts" inlineSize="large">
      <s-section>
        {crumbs(name)}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space[6], flexWrap: "wrap", marginBottom: space[6] }}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <h2 style={{ margin: 0, ...text.h2, color: color.textStrong, overflowWrap: "anywhere", fontFamily: contact ? undefined : fontFamily.mono }}>{name}</h2>
            <div style={{ display: "flex", gap: space[2], flexWrap: "wrap", marginTop: space[3] }}>
              <span style={badge(contact ? "success" : "neutral")}>{contact ? "SIGNED UP" : "ANONYMOUS"}</span>
              {v.loggedIn ? <span style={badge("accent")}>LOGGED IN</span> : null}
              <span style={badge("neutral")}>{v.source === "shopify" ? "STOREFRONT" : "WEBSITE"}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: space[4], flexWrap: "wrap" }}>
            <Link to="/app/contacts" aria-label="Back to contacts" title="Back to contacts" style={{ ...button("secondary", "md"), width: layout.controlMd, boxSizing: "border-box", padding: 0, textDecoration: "none" }}>
              <ArrowLeft aria-hidden size={17} strokeWidth={2} />
            </Link>
            {contact ? (
              <button type="button" style={button("primary", "md")} onClick={() => setJourneyOpen(true)}>
                <Route aria-hidden size={15} strokeWidth={2} />
                View contact journey
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: space[4], marginBottom: space[6] }}>
          <Stat label="Page views" value={counts.pageViews} />
          <Stat label="Popups shown" value={counts.popupsShown} />
          <Stat label="Popup clicks" value={counts.clicks} />
          <Stat label="Popups closed" value={counts.closes} />
          <Stat label="Signups" value={counts.signups} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: space[6], alignItems: "start" }}>
          <div style={{ ...card({ padding: 7 }) }}>
            <h3 style={{ margin: `0 0 ${space[5]}`, ...text.h4, color: color.textStrong }}>Details</h3>
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", rowGap: space[4], columnGap: space[4], ...text.body }}>
              <DetailRow label="Visitor ID">
                <span style={{ display: "flex", gap: space[3], alignItems: "center", minWidth: 0 }}>
                  <code style={{ fontFamily: fontFamily.mono, fontSize: "12px", overflowWrap: "anywhere", minWidth: 0 }}>{v.anonymousId}</code>
                  <CopyButton value={v.anonymousId} label="Copy" compact ariaLabel="Copy visitor ID" />
                </span>
              </DetailRow>
              {contact ? (
                <DetailRow label="Contact">
                  {[contact.email, contact.phone].filter(Boolean).join(" · ")}
                </DetailRow>
              ) : null}
              <DetailRow label="First seen">
                <AuditDate value={v.firstSeenAt} />
              </DetailRow>
              <DetailRow label="Last seen">
                <AuditDate value={v.lastSeenAt} />
              </DetailRow>
              {v.identifiedAt ? (
                <DetailRow label="Signed up">
                  <AuditDate value={v.identifiedAt} />
                </DetailRow>
              ) : null}
              <DetailRow label="Device">{deviceLine(v) || "Unknown"}</DetailRow>
              <DetailRow label="Came from">{arrivedFrom(v)}</DetailRow>
              {v.referrer ? <DetailRow label="Referrer"><RefLink url={v.referrer} /></DetailRow> : null}
              {utm ? <DetailRow label="UTM">{utm}</DetailRow> : null}
              {v.firstPageUrl ? <DetailRow label="Landing page"><RefLink url={v.firstPageUrl} /></DetailRow> : null}
              {v.lastPageUrl ? <DetailRow label="Last page"><RefLink url={v.lastPageUrl} /></DetailRow> : null}
            </dl>
          </div>

          <div style={{ ...card({ padding: 7 }) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: space[4], marginBottom: space[5] }}>
              <h3 style={{ margin: 0, ...text.h4, color: color.textStrong }}>Activity</h3>
              <span style={{ ...text.bodySm, color: color.textMuted }}>
                {truncated ? `Latest ${events.length} events` : `${events.length} event${events.length === 1 ? "" : "s"}`}
              </span>
            </div>

            {events.length === 0 ? (
              <div style={{ padding: `${space[6]} ${space[5]}`, textAlign: "center", border: `1px dashed ${color.borderStrong}`, borderRadius: "10px" }}>
                <div style={{ ...text.h4, color: color.textStrong }}>No events yet</div>
                <div style={{ ...text.bodySm, color: color.textMuted, marginTop: space[2] }}>Page views and popup activity show up here as they happen.</div>
              </div>
            ) : (
              <ol aria-label="Visitor activity" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {events.map((e) => {
                  const meta = eventLabel(e.type);
                  const day = dayLabel(e.occurredAt);
                  const heading = day !== lastDay ? day : null;
                  lastDay = day;
                  return (
                    <li key={e.id}>
                      {heading ? (
                        <div style={{ ...text.eyebrow, fontSize: "10px", color: color.textSubtle, padding: `${space[5]} 0 ${space[3]}` }}>{heading}</div>
                      ) : null}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) auto",
                          gap: space[4],
                          padding: `${space[4]} 0`,
                          borderTop: heading ? undefined : `1px solid ${color.borderSubtle}`,
                          alignItems: "start",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", gap: space[3], alignItems: "center", flexWrap: "wrap" }}>
                            <span style={badge(meta.tone)}>{meta.label.toUpperCase()}</span>
                            {e.campaignName ? (
                              <span style={{ ...text.bodySm, color: color.text, fontWeight: fontWeight.medium }}>{e.campaignName}</span>
                            ) : null}
                          </div>
                          {e.detail ? <div style={{ ...text.bodySm, color: color.text, marginTop: space[2], overflowWrap: "anywhere" }}>{e.detail}</div> : null}
                          {e.pageUrl ? (
                            <div style={{ ...text.bodySm, marginTop: space[2], minWidth: 0, display: "flex" }}>
                              <RefLink url={e.pageUrl} short nowrap />
                            </div>
                          ) : null}
                        </div>
                        <AuditDate value={e.occurredAt} seconds />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </s-section>

      {journeyOpen && contact ? (
        <ContactJourneyDialog contactId={contact.id} title={name} onClose={() => setJourneyOpen(false)} />
      ) : null}
    </s-page>
  );
}

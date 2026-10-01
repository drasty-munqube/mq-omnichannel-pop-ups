/* ============================================================
   CONTACT JOURNEY DIALOG

   Opened from a contact's ⋮ menu. Loads /app/journey/:id and
   shows the visitor ids (one per device or browser) and the
   events in time order: page views, popups shown and closed, the
   signup, the moment the visitor was identified (by signup or by
   their store login), and the discount emails. Signups and emails
   from before visitor tracking come from the saved records and are
   marked "saved".
   ============================================================ */

import { useEffect } from "react";
import { useFetcher } from "react-router";

import { AuditDate } from "./audit-cells";
import { RefLink } from "./ref-link";
import { badge, modalOverlay, modalPanel, skeleton } from "../design/styles";
import { color, fontFamily, fontWeight, radius, space, text, zIndex } from "../design/tokens";
import { eventLabel } from "../models/journey-events";
import { X } from "lucide-react";
import { IconButton } from "./icon-button";

type Journey = {
  contact: { id: string; email: string | null; phone: string | null; createdAt: string; shopifyCustomerId: string | null };
  visitors: {
    id: string;
    anonymousId: string;
    firstSeenAt: string;
    lastSeenAt: string;
    identifiedAt: string | null;
    visitCount: number;
    device: string | null;
    browser: string | null;
    os: string | null;
    country: string | null;
    referrer: string | null;
    firstPageUrl: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    source: string;
    loggedIn: boolean;
  }[];
  events: {
    id: string;
    type: string;
    occurredAt: string;
    pageUrl: string | null;
    campaignName: string | null;
    anonymousId: string | null;
    detail: string | null;
    saved: boolean;
  }[];
};

const short = (id: string) => id.slice(0, 8);

export function ContactJourneyDialog({ contactId, title, onClose }: { contactId: string; title: string; onClose: () => void }) {
  const fetcher = useFetcher<{ ok: boolean; journey?: Journey; error?: string }>();

  useEffect(() => {
    fetcher.load(`/app/journey/${encodeURIComponent(contactId)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const data = fetcher.data;
  const loading = fetcher.state !== "idle" || !data;
  const journey = data?.ok ? data.journey : null;

  return (
    <div
      role="presentation"
      style={{ ...modalOverlay(), zIndex: zIndex.modal }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mq-journey-title"
        style={{ ...modalPanel(), maxWidth: "720px", width: "calc(100% - 32px)", maxHeight: "calc(100vh - 64px)", display: "flex", flexDirection: "column" }}
      >
        <div style={{ padding: `${space[6]} ${space[7]}`, borderBottom: `1px solid ${color.borderSubtle}`, display: "flex", gap: space[5], alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id="mq-journey-title" style={{ margin: 0, ...text.h3, color: color.textStrong, overflowWrap: "anywhere" }}>
            Journey · {title}
          </h3>
          <p style={{ margin: `${space[2]} 0 0`, ...text.bodySm, color: color.textMuted }}>
            Visits on pages with a live campaign, signups and discount emails for this contact, oldest first.
          </p>
          </div>
          <IconButton icon={X} label="Close" variant="tertiary" onClick={onClose} />
        </div>

        <div style={{ padding: space[7], overflowY: "auto", display: "grid", gap: space[7] }}>
          {loading ? (
            <div style={{ display: "grid", gap: space[4] }} aria-busy>
              <span data-mq="skeleton" style={skeleton({ width: "50%", height: "14px" })} />
              <span data-mq="skeleton" style={skeleton({ width: "80%" })} />
              <span data-mq="skeleton" style={skeleton({ width: "70%" })} />
            </div>
          ) : !journey ? (
            <div role="alert" style={{ padding: space[5], borderRadius: radius.md, background: color.dangerSurface, color: color.dangerText, ...text.body }}>
              {data?.error || "The journey could not be loaded."}
            </div>
          ) : (
            <>
              <section>
                <h4 style={{ margin: `0 0 ${space[4]}`, ...text.h4, color: color.textStrong }}>
                  Visitors ({journey.visitors.length})
                </h4>
                {journey.visitors.length === 0 ? (
                  <p style={{ margin: 0, ...text.body, color: color.textMuted }}>
                    No visitor is linked yet. This contact signed up before visitor tracking, or with tracking off. Their next visit is
                    linked when they sign up again, or when they visit while logged in to the store after a logged-in signup.
                  </p>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: space[4] }}>
                    {journey.visitors.map((v) => (
                      <li key={v.id} style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[5], display: "grid", gap: space[2], ...text.bodySm, color: color.text }}>
                        <div style={{ display: "flex", gap: space[3], alignItems: "center", flexWrap: "wrap" }}>
                          <code style={{ fontFamily: fontFamily.mono, fontSize: "12px", color: color.textStrong }} title={v.anonymousId}>
                            {short(v.anonymousId)}
                          </code>
                          <span style={badge("neutral")}>{v.source === "shopify" ? "STOREFRONT" : "WEBSITE"}</span>
                          {v.loggedIn ? <span style={badge("accent")}>LOGGED IN</span> : null}
                          {[v.device, v.browser, v.os, v.country].filter(Boolean).map((t) => (
                            <span key={t as string} style={{ color: color.textMuted }}>{t}</span>
                          ))}
                        </div>
                        <div style={{ color: color.textMuted }}>
                          {v.visitCount} page view{v.visitCount === 1 ? "" : "s"} · first seen{" "}
                          {new Date(v.firstSeenAt).toLocaleString()} · last seen {new Date(v.lastSeenAt).toLocaleString()}
                        </div>
                        {v.utmSource || v.referrer ? (
                          <div style={{ color: color.textMuted, overflowWrap: "anywhere" }}>
                            {v.utmSource ? `UTM: ${[v.utmSource, v.utmMedium, v.utmCampaign].filter(Boolean).join(" / ")}` : null}
                            {v.utmSource && v.referrer ? " · " : null}
                            {v.referrer ? (
                              <>
                                Came from <RefLink url={v.referrer} short />
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4 style={{ margin: `0 0 ${space[4]}`, ...text.h4, color: color.textStrong }}>
                  Events ({journey.events.length})
                </h4>
                {journey.events.length === 0 ? (
                  <p style={{ margin: 0, ...text.body, color: color.textMuted }}>No events yet.</p>
                ) : (
                  <ol aria-label="Journey events" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 0 }}>
                    {journey.events.map((e, i) => {
                      const meta = eventLabel(e.type);
                      return (
                        <li
                          key={e.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            gap: space[4],
                            padding: `${space[4]} 0`,
                            borderTop: i ? `1px solid ${color.borderSubtle}` : undefined,
                            alignItems: "start",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", gap: space[3], alignItems: "center", flexWrap: "wrap" }}>
                              <span style={badge(meta.tone)}>{meta.label.toUpperCase()}</span>
                              {e.campaignName ? (
                                <span style={{ ...text.bodySm, color: color.text, fontWeight: fontWeight.medium }}>{e.campaignName}</span>
                              ) : null}
                              {journey.visitors.length > 1 && e.anonymousId ? (
                                <code style={{ fontFamily: fontFamily.mono, fontSize: "11px", color: color.textMuted }}>{short(e.anonymousId)}</code>
                              ) : null}
                              {e.saved ? (
                                <span style={{ ...text.caption, color: color.textMuted }} title="From the saved record, before each event was tracked">
                                  saved
                                </span>
                              ) : null}
                            </div>
                            {e.detail ? (
                              <div style={{ ...text.bodySm, color: color.text, marginTop: space[2], overflowWrap: "anywhere" }}>{e.detail}</div>
                            ) : null}
                            {e.pageUrl ? (
                              <div style={{ ...text.bodySm, marginTop: space[2], minWidth: 0, display: "flex" }}>
                                <RefLink url={e.pageUrl} short nowrap />
                              </div>
                            ) : null}
                          </div>
                          <AuditDate value={e.occurredAt} seconds />
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

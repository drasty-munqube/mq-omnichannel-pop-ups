/* ============================================================
   EMAIL TIMELINE (UI)

   The ordered list of events on an email's page in Logs: an icon
   per event type, its badge, the time, and what the event carries
   (the clicked link, a bounce or failure reason).
   ============================================================ */

import { AuditDate } from "./audit-cells";
import { badge } from "../design/styles";
import { color, fontWeight, radius, space, text } from "../design/tokens";
import { eventMeta, type EventIcon, type TimelineEntry } from "../models/email-timeline";

const ICON_PATHS: Record<EventIcon, string> = {
  queue: "M4 6h16M4 12h16M4 18h10",
  send: "M4 12 20 4l-4 16-4-7-8-1Z",
  check: "m5 12.5 4.5 4.5L19 7",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  eye: "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  cursor: "m5 3 14 7-6 2-2 6L5 3Z",
  bounce: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  x: "M6 6l12 12M18 6 6 18",
  calendar: "M4 7h16v13H4zM8 3v4m8-4v4M4 11h16",
  block: "M5.6 5.6l12.8 12.8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  dot: "M12 12h.01",
};

const TONE_COLORS = {
  neutral: { bg: "#F1F3F6", fg: "#5B6573" },
  info: { bg: "#E8F1FB", fg: "#1F5FA6" },
  success: { bg: "#E6F6EE", fg: "#1E7A4F" },
  warning: { bg: "#FDF3E1", fg: "#9A5B00" },
  danger: { bg: "#FDECEC", fg: "#B42318" },
  accent: { bg: "#F1ECFB", fg: "#5B3CC4" },
} as const;

export function EventGlyph({ icon, tone }: { icon: EventIcon; tone: keyof typeof TONE_COLORS }) {
  const c = TONE_COLORS[tone];
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "32px",
        height: "32px",
        borderRadius: "999px",
        background: c.bg,
        color: c.fg,
        flexShrink: 0,
        position: "relative",
        zIndex: 1,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={icon === "dot" ? 6 : 1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d={ICON_PATHS[icon]} />
      </svg>
    </span>
  );
}

export function EmailTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol aria-label="Email timeline" style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
      {entries.map((entry, i) => {
        const meta = eventMeta(entry.type);
        const last = i === entries.length - 1;
        return (
          <li key={entry.key} style={{ display: "grid", gridTemplateColumns: "32px 1fr", columnGap: space[5], position: "relative" }}>
            {!last ? (
              <span
                aria-hidden
                style={{ position: "absolute", left: "15px", top: "32px", bottom: 0, width: "2px", background: color.borderSubtle }}
              />
            ) : null}
            <EventGlyph icon={meta.icon} tone={meta.tone} />
            <div style={{ minWidth: 0, paddingBottom: last ? 0 : space[7] }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space[5], flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: space[3], flexWrap: "wrap", minHeight: "32px" }}>
                  <span style={{ ...text.body, fontWeight: fontWeight.semibold, color: color.textStrong }}>{meta.label}</span>
                  <span style={badge(meta.tone)}>{entry.type.replace(/^email\./, "").toUpperCase()}</span>
                  {entry.earlierAttempt ? <span style={badge("neutral")}>EARLIER ATTEMPT</span> : null}
                  {entry.saved ? (
                    <span style={{ ...text.caption, color: color.textMuted }} title="Recorded before each event was kept one by one">
                      saved time
                    </span>
                  ) : null}
                </div>
                <div style={{ paddingTop: "6px" }}>
                  <AuditDate value={entry.at} seconds />
                </div>
              </div>

              {meta.help ? <div style={{ ...text.bodySm, color: color.textMuted }}>{meta.help}</div> : null}

              {entry.link && !/^https?:\/\//i.test(entry.link) ? (
                <div style={{ marginTop: space[3], ...text.bodySm, color: color.text, overflowWrap: "anywhere" }}>Link: {entry.link}</div>
              ) : entry.link ? (
                <div style={{ marginTop: space[3], display: "flex", gap: space[3], alignItems: "baseline", minWidth: 0, ...text.bodySm }}>
                  <span style={{ color: color.textMuted, flexShrink: 0 }}>Link</span>
                  <a
                    href={entry.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={entry.link}
                    style={{ color: color.primary, overflowWrap: "anywhere", fontWeight: fontWeight.medium }}
                  >
                    {entry.link}
                  </a>
                </div>
              ) : null}

              {entry.detail ? (
                <div
                  style={{
                    marginTop: space[3],
                    padding: `${space[3]} ${space[4]}`,
                    borderRadius: radius.md,
                    background: meta.tone === "danger" ? color.dangerSurface : color.surfaceSunken,
                    color: meta.tone === "danger" ? color.dangerText : color.text,
                    ...text.bodySm,
                    overflowWrap: "anywhere",
                  }}
                >
                  {entry.detail}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ============================================================
   EMAIL TIMELINE (UI)

   The ordered list of events on an email's page in Logs: an icon
   per event type, its badge, the time, and what the event carries
   (the clicked link, a bounce or failure reason).
   ============================================================ */

import {
  Ban,
  Calendar,
  Check,
  Clock,
  Dot,
  Eye,
  Flag,
  ListOrdered,
  MousePointerClick,
  Send,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";

import { AuditDate } from "./audit-cells";
import { RefLink } from "./ref-link";
import { badge } from "../design/styles";
import { color, fontWeight, radius, space, text } from "../design/tokens";
import { eventMeta, type EventIcon, type TimelineEntry } from "../models/email-timeline";

const ICONS: Record<EventIcon, LucideIcon> = {
  queue: ListOrdered,
  send: Send,
  check: Check,
  clock: Clock,
  eye: Eye,
  cursor: MousePointerClick,
  bounce: Undo2,
  flag: Flag,
  x: X,
  calendar: Calendar,
  block: Ban,
  dot: Dot,
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
  const Glyph = ICONS[icon];
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
      <Glyph size={icon === "dot" ? 24 : 16} strokeWidth={icon === "dot" ? 3 : 2} />
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
                <div style={{ marginTop: space[3], display: "flex", gap: space[3], alignItems: "baseline", minWidth: 0, ...text.bodySm, color: color.text }}>
                  <span style={{ color: color.textMuted, flexShrink: 0 }}>Link</span>
                  <RefLink url={entry.link} />
                </div>
              ) : entry.link ? (
                <div style={{ marginTop: space[3], display: "flex", gap: space[3], alignItems: "baseline", minWidth: 0, ...text.bodySm }}>
                  <span style={{ color: color.textMuted, flexShrink: 0 }}>Link</span>
                  <RefLink url={entry.link} />
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

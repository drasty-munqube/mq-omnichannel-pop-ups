/* ============================================================
   JOURNEY EVENT LABELS (shared, browser-safe)

   Wording and badge tone for every event a visitor or contact can
   have, used by the contact Journey dialog and the Visitors pages.
   ============================================================ */

import type { BadgeTone } from "../design/styles";

export const EVENT_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  page_view: { label: "Page view", tone: "neutral" },
  popup_shown: { label: "Popup shown", tone: "info" },
  popup_clicked: { label: "Popup clicked", tone: "accent" },
  popup_closed: { label: "Popup closed", tone: "warning" },
  popup_submitted: { label: "Signed up", tone: "success" },
  identified: { label: "Identified", tone: "accent" },
  email_sent: { label: "Email sent", tone: "info" },
  email_delivered: { label: "Email delivered", tone: "success" },
  email_delayed: { label: "Email delayed", tone: "warning" },
  email_opened: { label: "Email opened", tone: "success" },
  email_clicked: { label: "Email clicked", tone: "accent" },
  email_bounced: { label: "Email bounced", tone: "danger" },
  email_complained: { label: "Marked as spam", tone: "danger" },
  email_failed: { label: "Email failed", tone: "danger" },
  email_suppressed: { label: "Email suppressed", tone: "warning" },
};

export function eventLabel(type: string) {
  return EVENT_LABEL[type] || { label: type.replace(/_/g, " "), tone: "neutral" as BadgeTone };
}

/* The short text under an event: what was clicked, or how the
   visitor was recognised. */
export function eventDetail(type: string, meta: unknown): string | null {
  const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  if (!m) return null;
  if (type === "popup_clicked" && typeof m.label === "string" && m.label) return `Clicked "${m.label}"`;
  if (type === "identified" && m.via === "shopify_login") return "Recognised from their store login";
  if (type === "identified" && typeof m.previousContactId === "string") return "Signed up again with a different email";
  return null;
}

/* ============================================================
   EMAIL TIMELINE (shared, browser-safe)

   Types for Resend's webhook payloads and GET /emails/:id, the
   wording and badge for every event type, and buildTimeline(),
   which turns stored events into the ordered list the email's
   page in Logs shows.

   Event types from https://resend.com/docs/webhooks/event-types
   ============================================================ */

import type { BadgeTone } from "../design/styles";

/* ------------------------------------------------------------
   RESEND PAYLOADS
------------------------------------------------------------ */

export type ResendEmailEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained"
  | "email.failed"
  | "email.scheduled"
  | "email.suppressed"
  | "email.received";

export type ResendWebhookEvent = {
  /* A known type, or something newer Resend adds later. */
  type: ResendEmailEventType | (string & Record<never, never>);
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    broadcast_id?: string;
    message_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    template_id?: string;
    /* Webhooks send tags as a name -> value map. */
    tags?: Record<string, string> | { name: string; value: string }[];
    click?: { link?: string; timestamp?: string; ipAddress?: string; userAgent?: string };
    bounce?: { type?: string; subType?: string; message?: string };
    failed?: { reason?: string };
    [key: string]: unknown;
  };
};

/* GET https://api.resend.com/emails/:id */
export type ResendEmail = {
  object: "email";
  id: string;
  message_id?: string;
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  html?: string | null;
  text?: string | null;
  bcc?: string[] | null;
  cc?: string[] | null;
  reply_to?: string[] | null;
  last_event?: string;
  scheduled_at?: string | null;
  tags?: { name: string; value: string }[];
};

/* ------------------------------------------------------------
   EVENT WORDING
------------------------------------------------------------ */

export type EventIcon = "queue" | "send" | "check" | "clock" | "eye" | "cursor" | "bounce" | "flag" | "x" | "calendar" | "block" | "dot";

export type EventMeta = { label: string; tone: BadgeTone; icon: EventIcon; help: string };

export const EVENT_META: Record<string, EventMeta> = {
  queued: { label: "Queued", tone: "neutral", icon: "queue", help: "The app queued this email to send." },
  "email.scheduled": { label: "Scheduled", tone: "info", icon: "calendar", help: "Resend will send this email at its scheduled time." },
  "email.sent": { label: "Sent", tone: "info", icon: "send", help: "Resend accepted the email and is sending it." },
  "email.delivery_delayed": {
    label: "Delivery delayed",
    tone: "warning",
    icon: "clock",
    help: "The receiving server did not accept it yet. Resend keeps trying.",
  },
  "email.delivered": { label: "Delivered", tone: "success", icon: "check", help: "The receiving server accepted the email." },
  "email.opened": { label: "Opened", tone: "success", icon: "eye", help: "The email was opened." },
  "email.clicked": { label: "Clicked", tone: "accent", icon: "cursor", help: "A link in the email was clicked." },
  "email.bounced": { label: "Bounced", tone: "danger", icon: "bounce", help: "The receiving server rejected the email." },
  "email.complained": { label: "Marked as spam", tone: "danger", icon: "flag", help: "The shopper reported this email as spam." },
  "email.failed": { label: "Failed", tone: "danger", icon: "x", help: "Resend could not send the email." },
  "email.suppressed": {
    label: "Suppressed",
    tone: "warning",
    icon: "block",
    help: "Resend did not send it because the address is on its suppression list.",
  },
};

/* Unknown or future types still show, with a readable label. */
export function eventMeta(type: string): EventMeta {
  const known = EVENT_META[type];
  if (known) return known;
  const words = type.replace(/^email\./, "").replace(/[_.]+/g, " ").trim();
  return {
    label: words ? words[0].toUpperCase() + words.slice(1) : "Event",
    tone: "neutral",
    icon: "dot",
    help: "",
  };
}

/* The short name the delivery row's lastEvent uses. */
export const LAST_EVENT_NAME: Record<string, string> = {
  "email.sent": "sent",
  "email.delivery_delayed": "delayed",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

/* Resend's last_event (GET /emails/:id) to the same short names. */
export function lastEventFromApi(value: string | undefined | null): string | null {
  switch (value) {
    case "sent":
    case "delivered":
    case "opened":
    case "clicked":
    case "bounced":
    case "complained":
    case "failed":
    case "suppressed":
      return value;
    case "delivery_delayed":
      return "delayed";
    default:
      return null;
  }
}

/* ------------------------------------------------------------
   TIMELINE
------------------------------------------------------------ */

export type StoredEvent = {
  id: string;
  providerId: string;
  type: string;
  occurredAt: string;
  link: string | null;
  bounceType: string | null;
  bounceSubType: string | null;
  reason: string | null;
};

export type TimelineEntry = {
  key: string;
  type: string;
  at: string;
  link?: string | null;
  detail?: string | null;
  /* From an earlier attempt, before a "Send again". */
  earlierAttempt?: boolean;
  /* Rebuilt from a saved timestamp, before events were kept one by one. */
  saved?: boolean;
};

type DeliveryTimes = {
  createdAt: string;
  sentAt: string | null;
  providerId: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
};

/* Ties at the same timestamp keep the natural order. */
const ORDER: Record<string, number> = {
  queued: 0,
  "email.scheduled": 1,
  "email.sent": 2,
  "email.delivery_delayed": 3,
  "email.delivered": 4,
  "email.opened": 5,
  "email.clicked": 6,
  "email.bounced": 7,
  "email.complained": 8,
  "email.failed": 9,
  "email.suppressed": 9,
};

function eventDetail(e: StoredEvent): string | null {
  if (e.type === "email.bounced") {
    const kind = [e.bounceType, e.bounceSubType].filter(Boolean).join(", ");
    return [kind, e.reason].filter(Boolean).join(": ") || null;
  }
  return e.reason;
}

/* Stored events first. For emails from before events were kept
   one by one, the saved first-time columns fill in the types that
   have no stored event, so older emails still show a history. */
export function buildTimeline(delivery: DeliveryTimes, events: StoredEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [{ key: "queued", type: "queued", at: delivery.createdAt }];

  for (const e of events) {
    entries.push({
      key: e.id,
      type: e.type,
      at: e.occurredAt,
      link: e.type === "email.clicked" ? e.link : null,
      detail: eventDetail(e),
      earlierAttempt: Boolean(delivery.providerId && e.providerId !== delivery.providerId),
    });
  }

  const has = new Set(events.map((e) => e.type));
  const saved: [string, string | null][] = [
    ["email.sent", delivery.sentAt],
    ["email.delivered", delivery.deliveredAt],
    ["email.opened", delivery.openedAt],
    ["email.clicked", delivery.clickedAt],
    ["email.bounced", delivery.bouncedAt],
    ["email.complained", delivery.complainedAt],
  ];
  for (const [type, at] of saved) {
    if (at && !has.has(type)) entries.push({ key: `saved-${type}`, type, at, saved: true });
  }

  return entries.sort((a, b) => {
    const diff = new Date(a.at).getTime() - new Date(b.at).getTime();
    return diff !== 0 ? diff : (ORDER[a.type] ?? 10) - (ORDER[b.type] ?? 10);
  });
}

/* Terminal states: nothing more is expected, though opens and
   clicks can still arrive for a delivered email. */
export function isFinalEvent(lastEvent: string | null) {
  return lastEvent === "bounced" || lastEvent === "complained" || lastEvent === "failed" || lastEvent === "suppressed";
}

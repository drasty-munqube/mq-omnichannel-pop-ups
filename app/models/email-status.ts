/* ============================================================
   EMAIL STATUS (shared, browser-safe)

   One place that turns a DiscountDelivery row (queue status +
   the last provider event) into what the Emails page shows.
   ============================================================ */

export type EmailStatusKey =
  | "queued"
  | "sent"
  | "delayed"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "suppressed"
  | "failed";

export type EmailStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const EMAIL_STATUS: Record<EmailStatusKey, { label: string; tone: EmailStatusTone }> = {
  queued: { label: "Queued", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  delayed: { label: "Delayed", tone: "warning" },
  delivered: { label: "Delivered", tone: "success" },
  opened: { label: "Opened", tone: "success" },
  clicked: { label: "Clicked", tone: "success" },
  bounced: { label: "Bounced", tone: "danger" },
  complained: { label: "Spam report", tone: "danger" },
  suppressed: { label: "Suppressed", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
};

/* Filter tabs on the Emails page. "bounced" also covers spam
   reports; "failed" also covers suppressed addresses. */
export const EMAIL_FILTERS = [
  { key: "all", label: "All" },
  { key: "queued", label: "Queued" },
  { key: "sent", label: "Sent" },
  { key: "delivered", label: "Delivered" },
  { key: "opened", label: "Opened" },
  { key: "clicked", label: "Clicked" },
  { key: "bounced", label: "Bounced" },
  { key: "failed", label: "Failed" },
] as const;

export type EmailFilterKey = (typeof EMAIL_FILTERS)[number]["key"];

export function isEmailFilter(value: string | null | undefined): value is EmailFilterKey {
  return EMAIL_FILTERS.some((f) => f.key === value);
}

export function emailStatus(row: { status: string; lastEvent: string | null }): EmailStatusKey {
  if (row.status === "pending") return "queued";
  const event = row.lastEvent;
  if (event === "bounced" || event === "complained" || event === "suppressed") return event;
  if (row.status === "failed" || event === "failed") return "failed";
  if (event === "clicked" || event === "opened" || event === "delivered" || event === "delayed") return event;
  return "sent";
}

/* How far along a message is. A later webhook only moves
   lastEvent forward, so an "opened" that arrives after "clicked"
   (webhooks are not ordered) does not undo it. */
export const EVENT_RANK: Record<string, number> = {
  sent: 1,
  delayed: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  failed: 5,
  suppressed: 6,
  bounced: 6,
  complained: 6,
};

/* Whether the merchant can press "Resend" for this row. Bounced,
   spam-reported and suppressed addresses are left alone: sending
   again would only hurt the sender's reputation. */
export function canRetry(key: EmailStatusKey) {
  return key === "failed";
}

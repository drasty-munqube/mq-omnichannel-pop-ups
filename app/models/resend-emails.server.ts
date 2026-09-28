/* ============================================================
   RESEND EMAILS API (server only)

   GET https://api.resend.com/emails/:id, used to backfill and
   double-check an email's page in Logs: the From line for older
   emails, and the latest status (last_event) in case a webhook
   was missed. Resend has no API for an email's full event
   history; that comes from webhooks only.

   Reading emails needs a Full access key, so the same key as
   domain management is used (RESEND_DOMAINS_API_KEY, then
   RESEND_API_KEY). The key never reaches the browser.
   ============================================================ */

import db from "../db.server";
import { EVENT_RANK } from "./email-status";
import { lastEventFromApi, type ResendEmail } from "./email-timeline";
import { RESEND_API_BASE, RESEND_TIMEOUT_MS, ResendDomainError, domainsApiKey, mapResendError } from "./resend-domains.server";

/* How often an open email page may ask Resend again. */
export const SYNC_EVERY_MS = 60_000;

const FRIENDLY_EMAIL: Partial<Record<ResendDomainError["code"], string>> = {
  not_found: "Resend has no record of this email. It may have been sent with a different Resend account or API key.",
  restricted_key:
    "The Resend API key can only send emails, so the latest status could not be checked. Set RESEND_DOMAINS_API_KEY to a Full access key.",
  not_configured: "Resend is not connected, so the latest status could not be checked.",
};

export function friendlyEmailError(error: unknown) {
  if (error instanceof ResendDomainError) {
    return FRIENDLY_EMAIL[error.code] || error.friendly;
  }
  return "Could not reach Resend. Showing the saved timeline.";
}

export async function getResendEmail(id: string): Promise<ResendEmail> {
  const key = domainsApiKey();
  if (!key) throw new ResendDomainError("not_configured");

  let response: Response;
  try {
    response = await fetch(`${RESEND_API_BASE}/emails/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ResendDomainError("network", 0, error instanceof Error ? error.message : String(error));
  }

  const raw = await response.text().catch(() => "");
  let parsed: unknown = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = { message: raw.slice(0, 300) };
  }
  if (!response.ok) throw mapResendError(response.status, parsed);
  return parsed as ResendEmail;
}

type SyncRow = {
  id: string;
  provider: string | null;
  providerId: string | null;
  providerSyncedAt: Date | null;
  fromAddress: string | null;
  subject: string | null;
  lastEvent: string | null;
};

export type SyncResult = { apiLastEvent: string | null; error: string | null; synced: boolean };

/* Asks Resend for the email and saves what it adds: From for older
   emails, and a more advanced status if a webhook was missed.
   Never throws; a Resend problem becomes `error`. */
export async function syncEmailFromResend(row: SyncRow, options: { force?: boolean; now?: Date } = {}): Promise<SyncResult> {
  const now = options.now ?? new Date();
  if (row.provider !== "resend" || !row.providerId) return { apiLastEvent: null, error: null, synced: false };
  if (!options.force && row.providerSyncedAt && now.getTime() - row.providerSyncedAt.getTime() < SYNC_EVERY_MS) {
    return { apiLastEvent: null, error: null, synced: false };
  }

  let email: ResendEmail;
  try {
    email = await getResendEmail(row.providerId);
  } catch (error) {
    if (error instanceof ResendDomainError) console.error("RESEND EMAIL SYNC:", error.message);
    else console.error("RESEND EMAIL SYNC:", error);
    /* Still counts as a try, so a Resend outage is not hammered. */
    await db.discountDelivery.updateMany({ where: { id: row.id }, data: { providerSyncedAt: now } });
    return { apiLastEvent: null, error: friendlyEmailError(error), synced: false };
  }

  const data: Record<string, unknown> = { providerSyncedAt: now };
  if (!row.fromAddress && email.from) data.fromAddress = String(email.from).slice(0, 300);
  if (!row.subject && email.subject) data.subject = String(email.subject).slice(0, 300);

  const apiLastEvent = lastEventFromApi(email.last_event);
  if (apiLastEvent) {
    const current = row.lastEvent ? EVENT_RANK[row.lastEvent] ?? 0 : 0;
    if ((EVENT_RANK[apiLastEvent] ?? 0) > current) {
      data.lastEvent = apiLastEvent;
      if (apiLastEvent === "failed") data.status = "failed";
    }
  }

  await db.discountDelivery.updateMany({ where: { id: row.id }, data });
  return { apiLastEvent, error: null, synced: true };
}

/* ============================================================
   EMAIL EVENTS + EMAIL LOG (server)

   1. Resend webhooks: verify the signature, then move the
      matching DiscountDelivery row forward (delivered, opened,
      clicked, bounced...). Bounces and spam reports add the
      address to EmailSuppression so it is not mailed again.
   2. The Emails page: list, filter and retry deliveries, always
      scoped to the shop from the admin session.
   ============================================================ */

import crypto from "node:crypto";

import db from "../db.server";
import {
  EVENT_RANK,
  canRetry,
  emailStatus,
  type EmailFilterKey,
} from "./email-status";
import { kickDeliveries } from "./delivery.server";

/* ------------------------------------------------------------
   WEBHOOK SIGNATURE (Svix scheme, used by Resend)

   signed content = "<svix-id>.<svix-timestamp>.<raw body>"
   key            = base64 part of the "whsec_..." secret
   header         = "v1,<base64 sig> v1,<base64 sig> ..."
   ------------------------------------------------------------ */

const TOLERANCE_SECONDS = 5 * 60;

export function verifyResendSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;

  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) {
    return false;
  }

  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  if (!key.length) return false;

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`)
    .digest();

  return headers.signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

/* ------------------------------------------------------------
   RECORD ONE EVENT
   ------------------------------------------------------------ */

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    failed?: { reason?: string };
    [key: string]: unknown;
  };
};

const EVENT_NAMES: Record<string, string> = {
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

export type RecordResult = "ok" | "ignored" | "not_found";

export async function recordEmailEvent(event: ResendEvent): Promise<RecordResult> {
  const name = event.type ? EVENT_NAMES[event.type] : undefined;
  const emailId = event.data?.email_id;
  if (!name || !emailId) return "ignored";

  const row = await db.discountDelivery.findFirst({
    where: { providerId: emailId },
    select: { id: true, shop: true, destination: true, lastEvent: true, lastEventAt: true },
  });
  if (!row) return "not_found";

  const parsed = new Date(event.created_at || event.data?.created_at || Date.now());
  const at = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const data: Record<string, unknown> = {};

  const currentRank = row.lastEvent ? EVENT_RANK[row.lastEvent] ?? 0 : 0;
  if ((EVENT_RANK[name] ?? 0) >= currentRank) {
    data.lastEvent = name;
    data.lastEventAt = !row.lastEventAt || at > row.lastEventAt ? at : row.lastEventAt;
  }

  /* First-time timestamps only; a second open does not move the
     "opened" time. Set with a conditional update below. */
  const firstField: Record<string, string> = {
    delivered: "deliveredAt",
    opened: "openedAt",
    clicked: "clickedAt",
    bounced: "bouncedAt",
    complained: "complainedAt",
  };

  if (name === "bounced") {
    const bounce = event.data?.bounce;
    data.error = `Bounced${bounce?.type ? ` (${bounce.type})` : ""}: ${bounce?.message || "the receiving server rejected the message"}`.slice(0, 500);
  }
  if (name === "failed") {
    data.status = "failed";
    data.error = `Provider failed to send: ${event.data?.failed?.reason || "unknown reason"}`.slice(0, 500);
  }
  if (name === "complained") {
    data.error = "The shopper marked this email as spam.";
  }
  if (name === "suppressed") {
    data.error = "The provider did not send this: the address is on its suppression list.";
  }

  if (Object.keys(data).length) {
    await db.discountDelivery.updateMany({ where: { id: row.id }, data });
  }

  const field = firstField[name];
  if (field) {
    await db.discountDelivery.updateMany({
      where: { id: row.id, [field]: null },
      data: { [field]: at },
    });
  }

  /* Soft (transient) bounces are temporary: a full mailbox, a
     server hiccup. Only hard bounces and spam reports suppress. */
  const transient = /transient|temporary|soft/i.test(event.data?.bounce?.type || "");
  if ((name === "bounced" && !transient) || name === "complained" || name === "suppressed") {
    const email = row.destination.trim().toLowerCase();
    await db.emailSuppression.upsert({
      where: { shop_email: { shop: row.shop, email } },
      create: { shop: row.shop, email, reason: name },
      update: {},
    });
  }

  return "ok";
}

/* ------------------------------------------------------------
   EMAIL LOG (admin page)
   ------------------------------------------------------------ */

export const EMAIL_PAGE_SIZE = 25;

function filterWhere(filter: EmailFilterKey) {
  switch (filter) {
    case "queued":
      return { status: "pending" };
    case "sent":
      return { status: "sent", OR: [{ lastEvent: null }, { lastEvent: { in: ["sent", "delayed"] } }] };
    case "delivered":
    case "opened":
    case "clicked":
      return { status: "sent", lastEvent: filter };
    case "bounced":
      return { lastEvent: { in: ["bounced", "complained"] } };
    case "failed":
      return {
        OR: [
          { status: "failed", NOT: { lastEvent: { in: ["bounced", "complained"] } } },
          { status: "failed", lastEvent: null },
          { lastEvent: { in: ["failed", "suppressed"] } },
        ],
      };
    default:
      return {};
  }
}

export async function listEmailLog(
  shop: string,
  options: { filter: EmailFilterKey; q: string; page: number },
) {
  const q = options.q.trim().slice(0, 200);
  const where = {
    shop,
    channel: "email",
    ...filterWhere(options.filter),
    ...(q ? { destination: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [total, rows] = await Promise.all([
    db.discountDelivery.count({ where }),
    db.discountDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, options.page) - 1) * EMAIL_PAGE_SIZE,
      take: EMAIL_PAGE_SIZE,
    }),
  ]);

  const campaignIds = [...new Set(rows.map((r) => r.campaignId))];
  const templateIds = [...new Set(rows.map((r) => r.templateId).filter((v): v is string => !!v))];

  const [campaigns, templates] = await Promise.all([
    campaignIds.length
      ? db.campaign.findMany({ where: { shop, id: { in: campaignIds } }, select: { id: true, name: true } })
      : [],
    templateIds.length
      ? db.emailTemplate.findMany({ where: { shop, id: { in: templateIds } }, select: { id: true, name: true } })
      : [],
  ]);
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const templateName = new Map(templates.map((t) => [t.id, t.name]));

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      to: r.destination,
      subject: r.subject,
      campaignName: campaignName.get(r.campaignId) || null,
      templateName: r.templateId ? templateName.get(r.templateId) || "Deleted template" : null,
      provider: r.provider,
      status: emailStatus(r),
      attempts: r.attempts,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      openedAt: r.openedAt?.toISOString() ?? null,
      clickedAt: r.clickedAt?.toISOString() ?? null,
      bouncedAt: r.bouncedAt?.toISOString() ?? null,
      complainedAt: r.complainedAt?.toISOString() ?? null,
      lastEventAt: r.lastEventAt?.toISOString() ?? null,
    })),
  };
}

/* Put a failed delivery back in the queue. A new round gives it a
   new idempotency key, and the send loop runs right away. */
export async function retryEmailDelivery(shop: string, id: string) {
  const row = await db.discountDelivery.findFirst({
    where: { id, shop },
    select: { id: true, status: true, lastEvent: true, round: true },
  });
  if (!row) return { ok: false as const, error: "Email not found." };
  if (!canRetry(emailStatus(row))) {
    return { ok: false as const, error: "Only failed emails can be sent again." };
  }

  const updated = await db.discountDelivery.updateMany({
    where: { id: row.id, shop, status: row.status, round: row.round },
    data: {
      status: "pending",
      attempts: 0,
      error: null,
      lastEvent: null,
      lastEventAt: null,
      round: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    return { ok: false as const, error: "This email changed in the meantime. Refresh and try again." };
  }

  kickDeliveries(shop);
  return { ok: true as const };
}

/* ============================================================
   EMAIL EVENTS + EMAIL LOG (server)

   1. Resend webhooks: verify the signature, then move the
      matching DiscountDelivery row forward (delivered, opened,
      clicked, bounced...). Bounces and spam reports add the
      address to EmailSuppression so it is not mailed again.
   2. The Logs page: list, filter and retry deliveries, always
      scoped to the shop from the admin session.
   3. One email's page: its details and every stored event for
      the Timeline, checked against Resend.
   ============================================================ */

import crypto from "node:crypto";

import db from "../db.server";
import {
  EMAIL_PAGE_SIZE,
  EVENT_RANK,
  canRetry,
  emailStatus,
  type EmailFilterKey,
} from "./email-status";
import { kickDeliveries } from "./delivery.server";
import { LAST_EVENT_NAME, type ResendWebhookEvent } from "./email-timeline";
import { syncEmailFromResend } from "./resend-emails.server";

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

   1. Find the email: by Resend's email id, or, when the webhook
      beats the send loop to saving that id, by the delivery_id tag
      every email is sent with.
   2. Store the event once (dedupeKey = the webhook's svix-id), so
      a webhook Resend retries or delivers twice is a no-op.
   3. Move the delivery row forward (status, first-time columns,
      suppression list). Only ever forward, so events arriving out
      of order do not undo a later state.
   ------------------------------------------------------------ */

type ResendEvent = ResendWebhookEvent;

export type RecordResult = "ok" | "duplicate" | "ignored" | "not_found";

type WebhookTags = NonNullable<ResendWebhookEvent["data"]>["tags"];

function tagValue(tags: WebhookTags, name: string) {
  if (!tags) return undefined;
  if (Array.isArray(tags)) return tags.find((t) => t?.name === name)?.value;
  return (tags as Record<string, string>)[name];
}

function parseDate(...values: (string | undefined)[]) {
  for (const v of values) {
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/* The event's data without the recipient list or the clicker's IP
   address and browser, which the Timeline does not show. */
function trimmedPayload(event: ResendEvent) {
  const rest: Record<string, unknown> = { ...(event.data || {}) };
  const click = event.data?.click;
  delete rest.to;
  delete rest.from;
  delete rest.click;
  return JSON.parse(
    JSON.stringify({
      ...rest,
      ...(click ? { click: { link: click.link, timestamp: click.timestamp } } : {}),
    }),
  );
}

export function eventDedupeKey(event: ResendEvent, webhookId?: string | null) {
  if (webhookId) return `svix:${webhookId}`.slice(0, 200);
  const d = event.data || {};
  return (
    "hash:" +
    crypto
      .createHash("sha256")
      .update([d.email_id, event.type, event.created_at, d.created_at, d.click?.link, d.click?.timestamp].join("|"))
      .digest("hex")
  );
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "P2002");
}

export async function recordEmailEvent(
  event: ResendEvent,
  options: { webhookId?: string | null } = {},
): Promise<RecordResult> {
  const type = typeof event.type === "string" ? event.type : "";
  const emailId = event.data?.email_id;
  if (!type.startsWith("email.") || type === "email.received" || !emailId) return "ignored";

  const select = { id: true, shop: true, destination: true, lastEvent: true, lastEventAt: true, providerId: true } as const;
  let row = await db.discountDelivery.findFirst({ where: { providerId: emailId }, select });
  if (!row) {
    const deliveryId = tagValue(event.data?.tags, "delivery_id");
    if (deliveryId) {
      row = await db.discountDelivery.findFirst({ where: { id: deliveryId, channel: "email" }, select });
    }
  }
  if (!row) return "not_found";

  const at = parseDate(
    type === "email.clicked" ? event.data?.click?.timestamp : undefined,
    event.data?.created_at,
    event.created_at,
  );

  try {
    await db.emailEvent.create({
      data: {
        shop: row.shop,
        deliveryId: row.id,
        providerId: emailId,
        type: type.slice(0, 100),
        occurredAt: at,
        dedupeKey: eventDedupeKey(event, options.webhookId),
        link: event.data?.click?.link?.slice(0, 2000) || null,
        bounceType: event.data?.bounce?.type?.slice(0, 100) || null,
        bounceSubType: event.data?.bounce?.subType?.slice(0, 100) || null,
        reason: (event.data?.bounce?.message || event.data?.failed?.reason || null)?.slice(0, 1000) ?? null,
        payload: trimmedPayload(event),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }

  /* The webhook arrived before the send loop saved the id. */
  if (!row.providerId) {
    await db.discountDelivery.updateMany({ where: { id: row.id, providerId: null }, data: { providerId: emailId } });
  }

  const name = LAST_EVENT_NAME[type];
  if (!name) return "ok";

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

export { EMAIL_PAGE_SIZE };

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

/* ------------------------------------------------------------
   ONE EMAIL (its page in Logs)

   The delivery row plus every stored event, always scoped to the
   shop. When the email went through Resend, the latest status is
   also checked against Resend (at most once a minute, or right
   away with `sync: "force"`).
   ------------------------------------------------------------ */

export async function getEmailDetail(shop: string, id: string, options: { sync?: "auto" | "force" | "off" } = {}) {
  const find = () => db.discountDelivery.findFirst({ where: { id, shop, channel: "email" } });
  let row = await find();
  if (!row) return null;

  let syncError: string | null = null;
  let apiLastEvent: string | null = null;
  if (options.sync !== "off") {
    const result = await syncEmailFromResend(row, { force: options.sync === "force" });
    syncError = result.error;
    apiLastEvent = result.apiLastEvent;
    if (result.synced) row = (await find()) ?? row;
  }

  const [events, campaign, template] = await Promise.all([
    db.emailEvent.findMany({
      where: { shop, deliveryId: row.id },
      orderBy: { occurredAt: "asc" },
      take: 500,
      select: {
        id: true,
        providerId: true,
        type: true,
        occurredAt: true,
        link: true,
        bounceType: true,
        bounceSubType: true,
        reason: true,
      },
    }),
    db.campaign.findFirst({ where: { shop, id: row.campaignId }, select: { name: true } }),
    row.templateId
      ? db.emailTemplate.findFirst({ where: { shop, id: row.templateId }, select: { name: true } })
      : null,
  ]);

  const iso = (d: Date | null) => d?.toISOString() ?? null;

  return {
    email: {
      id: row.id,
      to: row.destination,
      from: row.fromAddress,
      subject: row.subject,
      provider: row.provider,
      providerId: row.providerId,
      status: emailStatus(row),
      lastEvent: row.lastEvent,
      attempts: row.attempts,
      error: row.error,
      campaignName: campaign?.name ?? null,
      templateName: row.templateId ? template?.name || "Deleted template" : null,
      createdAt: row.createdAt.toISOString(),
      sentAt: iso(row.sentAt),
      deliveredAt: iso(row.deliveredAt),
      openedAt: iso(row.openedAt),
      clickedAt: iso(row.clickedAt),
      bouncedAt: iso(row.bouncedAt),
      complainedAt: iso(row.complainedAt),
      lastEventAt: iso(row.lastEventAt),
    },
    events: events.map((e) => ({ ...e, occurredAt: e.occurredAt.toISOString() })),
    apiLastEvent,
    syncError,
  };
}

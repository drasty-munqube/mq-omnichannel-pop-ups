/* ============================================================
   VISITORS (server only)

   Anonymous visitors, their events, and linking them to a contact
   when they share an email or phone.

     trackVisitor          POST /api/track and the proxy twin:
                           create or update the visitor, store the
                           batch of events.
     recordPopupVisitorEvent  popup shown / closed, sent with the
                           existing view and dismiss events.
     resolveContact        find the shop's contact by email or
                           phone, or create it.
     identifyVisitor       link a visitor to a contact and give
                           the contact the visitor's past events.
     getContactJourney     everything a contact did, in order.
     eraseVisitorsForContacts / eraseShopVisitors  privacy erasure.

   Every query is scoped by shop, so one store's visitors can never
   show up for another.
   ============================================================ */

import crypto from "node:crypto";

import db from "../db.server";
import { eventDetail } from "./journey-events";
import {
  cleanCustomerId,
  isAnonymousId,
  normalizeEmail,
  normalizePhone,
  parseUserAgent,
  utmFromUrl,
  type CleanTrack,
  type VisitorEventType,
} from "./visitor-tracking";

export type TrackSource = "shopify" | "external";

export type RequestInfo = {
  userAgent?: string | null;
  country?: string | null;
  /* The logged-in Shopify customer, from the signed App Proxy
     request (logged_in_customer_id). Storefront only; never taken
     from the request body. */
  shopifyCustomerId?: string | null;
};

export { cleanCustomerId };

const newEventId = () => crypto.randomUUID();

/* ------------------------------------------------------------
   VISITOR
------------------------------------------------------------ */

type VisitorSeed = {
  pageUrl?: string | null;
  referrer?: string | null;
  device?: string | null;
  utm?: Partial<Record<"utmSource" | "utmMedium" | "utmCampaign" | "utmTerm" | "utmContent", string | null>>;
  pageViews?: number;
};

async function upsertVisitor(shop: string, anonymousId: string, source: TrackSource, seed: VisitorSeed, info: RequestInfo) {
  const { browser, os } = parseUserAgent(info.userAgent);
  const now = new Date();
  const pageViews = seed.pageViews ?? 0;

  return db.visitor.upsert({
    where: { shop_anonymousId: { shop, anonymousId } },
    create: {
      shop,
      anonymousId,
      source,
      firstSeenAt: now,
      lastSeenAt: now,
      visitCount: pageViews,
      firstPageUrl: seed.pageUrl ?? null,
      lastPageUrl: seed.pageUrl ?? null,
      /* Referrer and UTM describe how they first arrived, so they
         are only written once. */
      referrer: seed.referrer ?? null,
      ...(seed.utm ?? {}),
      device: seed.device ?? null,
      browser,
      os,
      country: info.country ?? null,
      shopifyCustomerId: cleanCustomerId(info.shopifyCustomerId),
    },
    update: {
      lastSeenAt: now,
      ...(pageViews ? { visitCount: { increment: pageViews } } : {}),
      ...(seed.pageUrl ? { lastPageUrl: seed.pageUrl } : {}),
      ...(seed.device ? { device: seed.device } : {}),
      ...(browser ? { browser } : {}),
      ...(os ? { os } : {}),
      ...(info.country ? { country: info.country } : {}),
      ...(cleanCustomerId(info.shopifyCustomerId) ? { shopifyCustomerId: cleanCustomerId(info.shopifyCustomerId) } : {}),
    },
    select: { id: true, contactId: true, referrer: true, utmSource: true, utmMedium: true, utmCampaign: true, utmTerm: true, utmContent: true },
  }).then(async (row) => {
    /* The visitor may have been created a moment earlier by a
       popup event that carried no referrer or UTM. Fill them in
       once, the first time a request has them; never overwrite. */
    const fill: Record<string, string> = {};
    if (!row.referrer && seed.referrer) fill.referrer = seed.referrer;
    const hasUtm = row.utmSource || row.utmMedium || row.utmCampaign || row.utmTerm || row.utmContent;
    if (!hasUtm && seed.utm) {
      for (const [k, v] of Object.entries(seed.utm)) if (v) fill[k] = v;
    }
    if (Object.keys(fill).length) {
      await db.visitor.update({ where: { id: row.id }, data: fill });
    }
    return { id: row.id, contactId: row.contactId };
  }).then((visitor) => linkLoggedInVisitor(shop, anonymousId, visitor, info));
}

/* ------------------------------------------------------------
   LOGGED-IN SHOPIFY CUSTOMERS

   A shopper logged in to the store is the same person on every
   device. If an earlier signup recorded their Shopify customer id
   on a contact, a visitor seen with that id is linked to it right
   away, without filling the popup again, and gets its earlier
   events. No contact is created from the Shopify account itself.
------------------------------------------------------------ */

async function linkLoggedInVisitor(
  shop: string,
  anonymousId: string,
  visitor: { id: string; contactId: string | null },
  info: RequestInfo,
) {
  const customerId = cleanCustomerId(info.shopifyCustomerId);
  if (!customerId || visitor.contactId) return visitor;

  const contact = await db.contact.findFirst({
    where: { shop, shopifyCustomerId: customerId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!contact) return visitor;

  await attachVisitorsToContact(shop, [visitor.id], contact.id);
  await db.visitorEvent.create({
    data: {
      shop,
      eventId: newEventId(),
      visitorId: visitor.id,
      anonymousId,
      contactId: contact.id,
      type: "identified",
      occurredAt: new Date(),
      meta: { via: "shopify_login" },
    },
  });
  return { id: visitor.id, contactId: contact.id };
}

/* Link visitors (that have no contact yet) and hand their events
   without a contact to it. */
async function attachVisitorsToContact(shop: string, visitorIds: string[], contactId: string) {
  if (!visitorIds.length) return 0;
  const now = new Date();
  for (const id of visitorIds) {
    await db.visitor.update({ where: { id }, data: { contactId, identifiedAt: now } });
  }
  const merged = await db.visitorEvent.updateMany({
    where: { shop, visitorId: { in: visitorIds }, contactId: null },
    data: { contactId },
  });
  return merged.count;
}

/* After a logged-in signup: remember the customer id on the contact
   and link every other visitor of that customer (other devices,
   visits before the signup) that is not linked yet. */
export async function linkShopifyCustomer(shop: string, contactId: string, rawCustomerId: unknown) {
  const customerId = cleanCustomerId(rawCustomerId);
  if (!customerId) return 0;
  await db.contact.updateMany({ where: { shop, id: contactId, shopifyCustomerId: null }, data: { shopifyCustomerId: customerId } });
  const loose = await db.visitor.findMany({
    where: { shop, shopifyCustomerId: customerId, contactId: null },
    select: { id: true },
  });
  return attachVisitorsToContact(shop, loose.map((v) => v.id), contactId);
}

/* Campaign ids come from the browser, so they are checked against
   the shop before they are stored. */
async function campaignsOfShop(shop: string, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!unique.length) return new Set<string>();
  const rows = await db.campaign.findMany({ where: { shop, id: { in: unique } }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

/* ------------------------------------------------------------
   TRACK (public endpoint)
------------------------------------------------------------ */

export async function trackVisitor(shop: string, source: TrackSource, track: CleanTrack, info: RequestInfo = {}) {
  const visitor = await upsertVisitor(
    shop,
    track.anonymousId,
    source,
    {
      pageUrl: track.context.pageUrl,
      referrer: track.context.referrer,
      device: track.context.device,
      utm: track.context.utm,
      pageViews: track.events.filter((e) => e.type === "page_view").length,
    },
    info,
  );

  if (!track.events.length) return { visitorId: visitor.id, stored: 0 };

  const known = await campaignsOfShop(shop, track.events.map((e) => e.campaignId));
  const data = track.events
    /* A popup event for another shop's campaign is dropped; a page
       view just loses the unknown campaign id. */
    .filter((e) => e.type === "page_view" || (e.campaignId && known.has(e.campaignId)))
    .map((e) => ({
      shop,
      eventId: e.eventId,
      visitorId: visitor.id,
      anonymousId: track.anonymousId,
      contactId: visitor.contactId,
      campaignId: e.campaignId && known.has(e.campaignId) ? e.campaignId : null,
      popupId: e.campaignId && known.has(e.campaignId) ? e.popupId : null,
      type: e.type,
      pageUrl: e.pageUrl ?? track.context.pageUrl,
      occurredAt: e.occurredAt,
      ...(e.label ? { meta: { label: e.label } } : {}),
    }));

  if (!data.length) return { visitorId: visitor.id, stored: 0 };
  const result = await db.visitorEvent.createMany({ data, skipDuplicates: true });
  return { visitorId: visitor.id, stored: result.count };
}

/* ------------------------------------------------------------
   POPUP SHOWN / CLOSED

   The widget already reports views and dismissals for Analytics;
   when it adds the visitor id, the same request also lands in the
   visitor's history. Never throws.
------------------------------------------------------------ */

const POPUP_EVENT: Record<string, VisitorEventType> = { view: "popup_shown", dismiss: "popup_closed" };

export async function recordPopupVisitorEvent(
  shop: string,
  source: TrackSource,
  input: { anonymousId?: unknown; type?: string; campaignId?: string; popupId?: string; pageUrl?: string; device?: string },
  info: RequestInfo = {},
) {
  const type = POPUP_EVENT[String(input.type || "")];
  if (!type || !isAnonymousId(input.anonymousId) || !input.campaignId) return false;
  const anonymousId = input.anonymousId.toLowerCase();

  try {
    const known = await campaignsOfShop(shop, [input.campaignId]);
    if (!known.has(input.campaignId)) return false;
    const pageUrl = typeof input.pageUrl === "string" ? input.pageUrl.slice(0, 2048) : null;
    const device = ["desktop", "tablet", "mobile"].includes(String(input.device)) ? String(input.device) : null;
    const visitor = await upsertVisitor(shop, anonymousId, source, { pageUrl, device, utm: utmFromUrl(pageUrl) }, info);
    await db.visitorEvent.create({
      data: {
        shop,
        eventId: newEventId(),
        visitorId: visitor.id,
        anonymousId,
        contactId: visitor.contactId,
        campaignId: input.campaignId,
        popupId: typeof input.popupId === "string" ? input.popupId.slice(0, 64) : null,
        type,
        pageUrl,
        occurredAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    console.error("VISITOR POPUP EVENT ERROR:", error);
    return false;
  }
}

/* ------------------------------------------------------------
   CONTACT

   One contact per email (or phone, when there is no email) per
   shop. A second signup updates the existing contact's fields
   instead of adding a new row.
------------------------------------------------------------ */

export type ContactInput = {
  email?: string | null;
  phone?: string | null;
  fields?: Record<string, string>;
  popupId?: string | null;
  popupName?: string | null;
  campaignId?: string | null;
  pageUrl?: string | null;
};

export async function resolveContact(shop: string, input: ContactInput) {
  const email = normalizeEmail(input.email);
  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  const phone = normalizePhone(rawPhone);
  const fields = input.fields || {};

  let existing = null;
  if (email) {
    existing = await db.contact.findFirst({
      where: { shop, email: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    });
  }
  if (!existing && phone) {
    existing = await db.contact.findFirst({
      where: { shop, phone: { in: [...new Set([rawPhone, phone])] } },
      orderBy: { createdAt: "asc" },
    });
  }

  if (existing) {
    const oldFields =
      existing.fields && typeof existing.fields === "object" && !Array.isArray(existing.fields)
        ? (existing.fields as Record<string, string>)
        : {};
    const updated = await db.contact.update({
      where: { id: existing.id },
      data: {
        fields: { ...oldFields, ...fields },
        ...(!existing.email && email ? { email } : {}),
        ...(!existing.phone && rawPhone ? { phone: rawPhone } : {}),
      },
    });
    return { contact: updated, created: false };
  }

  const contact = await db.contact.create({
    data: {
      shop,
      popupId: input.popupId || null,
      popupName: input.popupName || null,
      campaignId: input.campaignId || null,
      email: email ?? (typeof input.email === "string" && input.email.trim() ? input.email.trim() : null),
      phone: rawPhone || null,
      fields,
      pageUrl: input.pageUrl || null,
    },
  });
  return { contact, created: true };
}

/* ------------------------------------------------------------
   IDENTIFY

   Link the visitor to the contact, give the contact every earlier
   event of this visitor that has no contact yet, and record the
   submission itself.

   - Same email on several devices: each device's visitor links to
     the same contact.
   - A different email later from the same visitor: the visitor
     moves to the new contact from now on. Events already given to
     the first contact stay there, and an "identified" event notes
     the previous contact.
------------------------------------------------------------ */

export async function identifyVisitor(
  shop: string,
  input: {
    anonymousId: unknown;
    contactId: string;
    source: TrackSource;
    campaignId?: string | null;
    popupId?: string | null;
    pageUrl?: string | null;
    device?: string | null;
  },
  info: RequestInfo = {},
) {
  if (!isAnonymousId(input.anonymousId)) return { linked: false as const };
  const anonymousId = input.anonymousId.toLowerCase();
  const pageUrl = typeof input.pageUrl === "string" ? input.pageUrl.slice(0, 2048) : null;

  const visitor = await upsertVisitor(shop, anonymousId, input.source, { pageUrl, device: input.device ?? null }, info);
  const previousContactId = visitor.contactId;
  const changed = previousContactId !== input.contactId;
  const now = new Date();

  if (changed) {
    await db.visitor.update({ where: { id: visitor.id }, data: { contactId: input.contactId, identifiedAt: now } });
  }

  const merged = await db.visitorEvent.updateMany({
    where: { shop, visitorId: visitor.id, contactId: null },
    data: { contactId: input.contactId },
  });

  const events: {
    shop: string;
    eventId: string;
    visitorId: string;
    anonymousId: string;
    contactId: string;
    campaignId: string | null;
    popupId: string | null;
    type: VisitorEventType;
    pageUrl: string | null;
    occurredAt: Date;
    meta?: { previousContactId: string };
  }[] = [
    {
      shop,
      eventId: newEventId(),
      visitorId: visitor.id,
      anonymousId,
      contactId: input.contactId,
      campaignId: input.campaignId || null,
      popupId: input.popupId || null,
      type: "popup_submitted",
      pageUrl,
      occurredAt: now,
    },
  ];
  if (changed) {
    events.push({
      shop,
      eventId: newEventId(),
      visitorId: visitor.id,
      anonymousId,
      contactId: input.contactId,
      campaignId: input.campaignId || null,
      popupId: input.popupId || null,
      type: "identified",
      pageUrl,
      /* A millisecond later so it sorts after the submission. */
      occurredAt: new Date(now.getTime() + 1),
      ...(previousContactId ? { meta: { previousContactId } } : {}),
    });
  }
  await db.visitorEvent.createMany({ data: events });

  return { linked: true as const, visitorId: visitor.id, previousContactId, changed, mergedEvents: merged.count };
}

/* ------------------------------------------------------------
   JOURNEY (admin)

   Everything known about a person, in time order:
   - events from every visitor linked to them (all devices,
     including logged-in visits linked by Shopify customer id),
   - their signups, also the ones from before visitor tracking,
     rebuilt from the saved contact rows (marked "saved"),
   - their discount emails: sent, delivered, opened, clicked,
     bounced, from the Logs data.
   Older duplicate contact rows with the same email (from before
   one contact per email) count as the same person.
------------------------------------------------------------ */

export type JourneyEvent = {
  id: string;
  type: string;
  occurredAt: string;
  pageUrl: string | null;
  campaignName: string | null;
  anonymousId: string | null;
  detail: string | null;
  saved: boolean;
};

const EMAIL_EVENT_TYPE: Record<string, string> = {
  "email.sent": "email_sent",
  "email.delivered": "email_delivered",
  "email.delivery_delayed": "email_delayed",
  "email.opened": "email_opened",
  "email.clicked": "email_clicked",
  "email.bounced": "email_bounced",
  "email.complained": "email_complained",
  "email.failed": "email_failed",
  "email.suppressed": "email_suppressed",
};

export async function getContactJourney(shop: string, contactId: string) {
  const contact = await db.contact.findFirst({
    where: { shop, id: contactId },
    select: { id: true, email: true, phone: true, createdAt: true, shopifyCustomerId: true },
  });
  if (!contact) return null;

  /* The same person's other contact rows. */
  const people = await db.contact.findMany({
    where: {
      shop,
      OR: [
        { id: contact.id },
        ...(contact.email ? [{ email: { equals: contact.email, mode: "insensitive" as const } }] : []),
        ...(contact.shopifyCustomerId ? [{ shopifyCustomerId: contact.shopifyCustomerId }] : []),
      ],
    },
    select: { id: true, createdAt: true, pageUrl: true, popupName: true, campaignId: true },
  });
  const contactIds = people.map((p) => p.id);
  const customerId = contact.shopifyCustomerId || null;

  const visitors = await db.visitor.findMany({
    where: {
      shop,
      OR: [{ contactId: { in: contactIds } }, ...(customerId ? [{ shopifyCustomerId: customerId }] : [])],
    },
    orderBy: { firstSeenAt: "asc" },
  });
  const visitorIds = visitors.map((v) => v.id);

  const [visitorEvents, deliveries] = await Promise.all([
    db.visitorEvent.findMany({
      where: {
        shop,
        OR: [{ contactId: { in: contactIds } }, ...(visitorIds.length ? [{ visitorId: { in: visitorIds } }] : [])],
      },
      orderBy: { occurredAt: "asc" },
      take: 1000,
    }),
    db.discountDelivery.findMany({
      where: { shop, contactId: { in: contactIds }, channel: "email" },
      select: {
        id: true,
        campaignId: true,
        sentAt: true,
        deliveredAt: true,
        openedAt: true,
        clickedAt: true,
        bouncedAt: true,
        complainedAt: true,
        error: true,
        status: true,
      },
    }),
  ]);

  const emailEvents = deliveries.length
    ? await db.emailEvent.findMany({
        where: { shop, deliveryId: { in: deliveries.map((d) => d.id) } },
        orderBy: { occurredAt: "asc" },
        select: { id: true, deliveryId: true, type: true, occurredAt: true, link: true, reason: true },
      })
    : [];

  const campaignIds = [
    ...new Set(
      [...visitorEvents.map((e) => e.campaignId), ...people.map((p) => p.campaignId), ...deliveries.map((d) => d.campaignId)].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
  const campaigns = campaignIds.length
    ? await db.campaign.findMany({ where: { shop, id: { in: campaignIds } }, select: { id: true, name: true } })
    : [];
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const nameOf = (id: string | null | undefined) => (id ? campaignName.get(id) || "Deleted campaign" : null);

  const events: JourneyEvent[] = [];

  /* 1. Tracked visitor events. An event that belongs to someone
     else now (the visitor later used a different email) stays with
     that person. */
  for (const e of visitorEvents) {
    if (e.contactId && !contactIds.includes(e.contactId)) continue;
    events.push({
      id: e.id,
      type: e.type,
      occurredAt: e.occurredAt.toISOString(),
      pageUrl: e.pageUrl,
      campaignName: nameOf(e.campaignId),
      anonymousId: e.anonymousId,
      detail: eventDetail(e.type, e.meta),
      saved: false,
    });
  }

  /* 2. Signups without a tracked submission nearby (from before
     visitor tracking, or with tracking off). */
  const submittedAt = visitorEvents.filter((e) => e.type === "popup_submitted").map((e) => e.occurredAt.getTime());
  for (const p of people) {
    const t = p.createdAt.getTime();
    if (submittedAt.some((s) => Math.abs(s - t) < 10 * 60_000)) continue;
    events.push({
      id: `signup-${p.id}`,
      type: "popup_submitted",
      occurredAt: p.createdAt.toISOString(),
      pageUrl: p.pageUrl,
      campaignName: nameOf(p.campaignId) || p.popupName,
      anonymousId: null,
      detail: p.popupName ? `Popup: ${p.popupName}` : null,
      saved: true,
    });
  }

  /* 3. Discount emails. Stored Resend events where there are any,
     otherwise the saved first-time columns. */
  for (const d of deliveries) {
    const mine = emailEvents.filter((e) => e.deliveryId === d.id);
    const has = new Set(mine.map((e) => EMAIL_EVENT_TYPE[e.type]).filter(Boolean));
    for (const e of mine) {
      const type = EMAIL_EVENT_TYPE[e.type];
      if (!type) continue;
      events.push({
        id: e.id,
        type,
        occurredAt: e.occurredAt.toISOString(),
        pageUrl: null,
        campaignName: nameOf(d.campaignId),
        anonymousId: null,
        detail: e.link || e.reason || null,
        saved: false,
      });
    }
    const savedCols: [string, Date | null][] = [
      ["email_sent", d.sentAt],
      ["email_delivered", d.deliveredAt],
      ["email_opened", d.openedAt],
      ["email_clicked", d.clickedAt],
      ["email_bounced", d.bouncedAt],
      ["email_complained", d.complainedAt],
    ];
    for (const [type, at] of savedCols) {
      if (!at || has.has(type)) continue;
      events.push({
        id: `${d.id}-${type}`,
        type,
        occurredAt: at.toISOString(),
        pageUrl: null,
        campaignName: nameOf(d.campaignId),
        anonymousId: null,
        detail: type === "email_bounced" ? d.error : null,
        saved: true,
      });
    }
    if (d.status === "failed" && !d.bouncedAt && !has.has("email_failed")) {
      events.push({
        id: `${d.id}-failed`,
        type: "email_failed",
        occurredAt: (d.sentAt || contact.createdAt).toISOString(),
        pageUrl: null,
        campaignName: nameOf(d.campaignId),
        anonymousId: null,
        detail: d.error,
        saved: true,
      });
    }
  }

  events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  return {
    contact: { id: contact.id, email: contact.email, phone: contact.phone, createdAt: contact.createdAt.toISOString(), shopifyCustomerId: customerId },
    visitors: visitors.map((v) => ({
      id: v.id,
      anonymousId: v.anonymousId,
      firstSeenAt: v.firstSeenAt.toISOString(),
      lastSeenAt: v.lastSeenAt.toISOString(),
      identifiedAt: v.identifiedAt?.toISOString() ?? null,
      visitCount: v.visitCount,
      device: v.device,
      browser: v.browser,
      os: v.os,
      country: v.country,
      referrer: v.referrer,
      firstPageUrl: v.firstPageUrl,
      utmSource: v.utmSource,
      utmMedium: v.utmMedium,
      utmCampaign: v.utmCampaign,
      source: v.source,
      loggedIn: Boolean(v.shopifyCustomerId),
    })),
    events: events.slice(0, 1000),
  };
}

/* ------------------------------------------------------------
   PRIVACY ERASURE
------------------------------------------------------------ */

export async function eraseVisitorsForContacts(shop: string, contactIds: string[], rawCustomerId?: unknown) {
  /* Shopify sends the customer id as a number. Visitors seen while
     logged in carry it even when they never signed up. */
  const customerId = cleanCustomerId(rawCustomerId == null ? null : String(rawCustomerId));
  if (!contactIds.length && !customerId) return;
  const visitors = await db.visitor.findMany({
    where: { shop, OR: [{ contactId: { in: contactIds } }, ...(customerId ? [{ shopifyCustomerId: customerId }] : [])] },
    select: { id: true },
  });
  const visitorIds = visitors.map((v) => v.id);
  await db.visitorEvent.deleteMany({
    where: { shop, OR: [{ contactId: { in: contactIds } }, ...(visitorIds.length ? [{ visitorId: { in: visitorIds } }] : [])] },
  });
  if (visitorIds.length) await db.visitor.deleteMany({ where: { shop, id: { in: visitorIds } } });
}

export function eraseShopVisitorsOps(shop: string) {
  return [db.visitorEvent.deleteMany({ where: { shop } }), db.visitor.deleteMany({ where: { shop } })];
}

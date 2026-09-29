/* ============================================================
   VISITORS LIST (server only)

   Every visitor the store's widget has seen, newest activity
   first, with what they did: page views, popups shown, clicks,
   closes and signups. Everything is scoped by shop.

     listVisitors      the Visitors page (filter, search, page)
     visitorSummary    the tiles above it (last 7 days)
     getVisitorDetail  one visitor's page: details and timeline
   ============================================================ */

import db from "../db.server";
import { eventDetail } from "./journey-events";
import {
  VISITOR_PAGE_SIZE,
  addVisitorCount,
  emptyVisitorCounts,
  type VisitorCounts,
  type VisitorFilterKey,
} from "./visitor-list";

const UUID_PREFIX = /^[0-9a-f-]{4,36}$/i;
const DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------
   LIST
------------------------------------------------------------ */

async function whereFor(shop: string, filter: VisitorFilterKey, q: string) {
  const and: Record<string, unknown>[] = [{ shop }];
  if (filter === "anonymous") and.push({ contactId: null });
  if (filter === "identified") and.push({ contactId: { not: null } });
  if (filter === "logged_in") and.push({ shopifyCustomerId: { not: null } });

  const term = q.trim();
  if (term) {
    /* A visitor id (or its first characters), or the email / phone
       of the contact a visitor is linked to. */
    const contacts = await db.contact.findMany({
      where: {
        shop,
        OR: [{ email: { contains: term, mode: "insensitive" } }, { phone: { contains: term } }],
      },
      select: { id: true },
      take: 200,
    });
    and.push({
      OR: [
        ...(UUID_PREFIX.test(term) ? [{ anonymousId: { startsWith: term.toLowerCase() } }] : []),
        ...(contacts.length ? [{ contactId: { in: contacts.map((c) => c.id) } }] : []),
        ...(/^\d{1,20}$/.test(term) ? [{ shopifyCustomerId: term }] : []),
      ],
    });
  }
  return { AND: and };
}

async function countsFor(shop: string, visitorIds: string[]) {
  const counts = new Map<string, VisitorCounts>();
  for (const id of visitorIds) counts.set(id, emptyVisitorCounts());
  if (!visitorIds.length) return counts;

  const rows = await db.visitorEvent.groupBy({
    by: ["visitorId", "type"],
    where: { shop, visitorId: { in: visitorIds } },
    _count: { _all: true },
  });
  for (const row of rows) {
    const c = counts.get(row.visitorId);
    if (c) addVisitorCount(c, row.type, row._count._all);
  }
  return counts;
}

export async function listVisitors(shop: string, opts: { filter: VisitorFilterKey; q: string; page: number }) {
  const where = await whereFor(shop, opts.filter, opts.q);
  const [total, visitors] = await Promise.all([
    db.visitor.count({ where }),
    db.visitor.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      skip: (opts.page - 1) * VISITOR_PAGE_SIZE,
      take: VISITOR_PAGE_SIZE,
    }),
  ]);

  const contactIds = [...new Set(visitors.map((v) => v.contactId).filter((v): v is string => Boolean(v)))];
  const [counts, contacts] = await Promise.all([
    countsFor(
      shop,
      visitors.map((v) => v.id),
    ),
    contactIds.length
      ? db.contact.findMany({ where: { shop, id: { in: contactIds } }, select: { id: true, email: true, phone: true } })
      : Promise.resolve([]),
  ]);
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  return {
    total,
    rows: visitors.map((v) => {
      const c = counts.get(v.id) ?? emptyVisitorCounts();
      const contact = v.contactId ? contactById.get(v.contactId) : null;
      return {
        id: v.id,
        anonymousId: v.anonymousId,
        source: v.source,
        firstSeenAt: v.firstSeenAt.toISOString(),
        lastSeenAt: v.lastSeenAt.toISOString(),
        device: v.device,
        browser: v.browser,
        os: v.os,
        country: v.country,
        referrer: v.referrer,
        utmSource: v.utmSource,
        utmMedium: v.utmMedium,
        firstPageUrl: v.firstPageUrl,
        lastPageUrl: v.lastPageUrl,
        loggedIn: Boolean(v.shopifyCustomerId),
        contact: contact ? { id: contact.id, email: contact.email, phone: contact.phone } : null,
        /* visitCount is kept on the row even while an event batch
           is still on its way, so take whichever is higher. */
        counts: { ...c, pageViews: Math.max(c.pageViews, v.visitCount) },
      };
    }),
  };
}

/* ------------------------------------------------------------
   SUMMARY (last 7 days)
------------------------------------------------------------ */

export async function visitorSummary(shop: string, now = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY);
  const [active, newVisitors, identified, events] = await Promise.all([
    db.visitor.count({ where: { shop, lastSeenAt: { gte: since } } }),
    db.visitor.count({ where: { shop, firstSeenAt: { gte: since } } }),
    db.visitor.count({ where: { shop, lastSeenAt: { gte: since }, contactId: { not: null } } }),
    db.visitorEvent.groupBy({
      by: ["type"],
      where: { shop, occurredAt: { gte: since }, type: { in: ["popup_shown", "popup_clicked", "popup_submitted"] } },
      _count: { _all: true },
    }),
  ]);
  const byType = new Map(events.map((e) => [e.type, e._count._all]));
  return {
    active,
    newVisitors,
    identified,
    popupsShown: byType.get("popup_shown") ?? 0,
    clicks: byType.get("popup_clicked") ?? 0,
    signups: byType.get("popup_submitted") ?? 0,
  };
}

/* ------------------------------------------------------------
   DETAIL
------------------------------------------------------------ */

export const VISITOR_EVENT_LIMIT = 500;

export async function getVisitorDetail(shop: string, visitorId: string) {
  const v = await db.visitor.findFirst({ where: { shop, id: visitorId } });
  if (!v) return null;

  const [events, counts, contact] = await Promise.all([
    db.visitorEvent.findMany({
      where: { shop, visitorId: v.id },
      orderBy: { occurredAt: "desc" },
      take: VISITOR_EVENT_LIMIT,
    }),
    countsFor(shop, [v.id]),
    v.contactId
      ? db.contact.findFirst({ where: { shop, id: v.contactId }, select: { id: true, email: true, phone: true, createdAt: true } })
      : Promise.resolve(null),
  ]);

  const campaignIds = [...new Set(events.map((e) => e.campaignId).filter((id): id is string => Boolean(id)))];
  const campaigns = campaignIds.length
    ? await db.campaign.findMany({ where: { shop, id: { in: campaignIds } }, select: { id: true, name: true } })
    : [];
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const c = counts.get(v.id) ?? emptyVisitorCounts();

  return {
    visitor: {
      id: v.id,
      anonymousId: v.anonymousId,
      source: v.source,
      firstSeenAt: v.firstSeenAt.toISOString(),
      lastSeenAt: v.lastSeenAt.toISOString(),
      identifiedAt: v.identifiedAt?.toISOString() ?? null,
      device: v.device,
      browser: v.browser,
      os: v.os,
      country: v.country,
      referrer: v.referrer,
      utmSource: v.utmSource,
      utmMedium: v.utmMedium,
      utmCampaign: v.utmCampaign,
      utmTerm: v.utmTerm,
      utmContent: v.utmContent,
      firstPageUrl: v.firstPageUrl,
      lastPageUrl: v.lastPageUrl,
      loggedIn: Boolean(v.shopifyCustomerId),
    },
    contact: contact
      ? { id: contact.id, email: contact.email, phone: contact.phone, createdAt: contact.createdAt.toISOString() }
      : null,
    counts: { ...c, pageViews: Math.max(c.pageViews, v.visitCount) },
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      occurredAt: e.occurredAt.toISOString(),
      pageUrl: e.pageUrl,
      campaignName: e.campaignId ? campaignName.get(e.campaignId) || "Deleted campaign" : null,
      detail: eventDetail(e.type, e.meta),
    })),
    truncated: events.length === VISITOR_EVENT_LIMIT,
  };
}

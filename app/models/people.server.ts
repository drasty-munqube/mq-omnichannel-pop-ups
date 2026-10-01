/* ============================================================
   PEOPLE (server only)

   The one list on the Contacts page: everyone who signed up
   (contacts) and everyone who only visited (anonymous visitors),
   together, most recently active first.

   A contact is one row however many devices they used; their
   visitors' activity is added up on that row. A visitor that
   became a contact is not listed again on its own. Contacts from
   before visitor tracking have no visitors and show their signup
   only.

   The two tables are merged and paged in the database (a UNION
   with one sort key), so paging stays correct at any size.
   Everything is scoped by shop.
   ============================================================ */

import { Prisma } from "@prisma/client";

import db from "../db.server";
import { addVisitorCount, emptyVisitorCounts, type VisitorCounts } from "./visitor-list";
import { visitorSummary } from "./visitor-list.server";
import { PEOPLE_PAGE_SIZE, normalizePeopleFilter, type PeopleFilterKey } from "./people";

type Key = { kind: "contact" | "visitor"; id: string };

function unionSql(shop: string, filter: PeopleFilterKey, q: string) {
  const term = q.trim();
  const like = `%${term}%`;
  const prefix = `${term.toLowerCase()}%`;
  const digits = /^\d{1,20}$/.test(term) ? term : null;

  const contactSearch = term
    ? Prisma.sql`AND (
        c."email" ILIKE ${like}
        OR c."phone" LIKE ${like}
        ${digits
          ? Prisma.sql`OR c."shopifyCustomerId" = ${digits}
              OR EXISTS (
                SELECT 1 FROM "Visitor" dv
                WHERE dv."shop" = ${shop} AND dv."contactId" = c."id" AND dv."shopifyCustomerId" = ${digits}
              )`
          : Prisma.empty}
        OR EXISTS (
          SELECT 1 FROM "Visitor" sv
          WHERE sv."shop" = ${shop} AND sv."contactId" = c."id" AND sv."anonymousId" LIKE ${prefix}
        )
      )`
    : Prisma.empty;

  const visitorSearch = term
    ? Prisma.sql`AND (
        v."anonymousId" LIKE ${prefix}
        ${digits ? Prisma.sql`OR v."shopifyCustomerId" = ${digits}` : Prisma.empty}
      )`
    : Prisma.empty;

  const contactPart = Prisma.sql`
    SELECT 'contact' AS kind, c."id" AS id,
           GREATEST(c."createdAt", COALESCE(MAX(cv."lastSeenAt"), c."createdAt")) AS last_at
    FROM "Contact" c
    LEFT JOIN "Visitor" cv ON cv."shop" = c."shop" AND cv."contactId" = c."id"
    WHERE c."shop" = ${shop}
      ${filter === "logged_in"
        ? Prisma.sql`AND (
            c."shopifyCustomerId" IS NOT NULL
            OR EXISTS (
              SELECT 1 FROM "Visitor" lv
              WHERE lv."shop" = ${shop} AND lv."contactId" = c."id" AND lv."shopifyCustomerId" IS NOT NULL
            )
          )`
        : Prisma.empty}
      ${contactSearch}
    GROUP BY c."id"`;

  const visitorPart = Prisma.sql`
    SELECT 'visitor' AS kind, v."id" AS id, v."lastSeenAt" AS last_at
    FROM "Visitor" v
    WHERE v."shop" = ${shop} AND v."contactId" IS NULL
      ${filter === "logged_in" ? Prisma.sql`AND v."shopifyCustomerId" IS NOT NULL` : Prisma.empty}
      ${visitorSearch}`;

  if (filter === "signed_up") return contactPart;
  if (filter === "anonymous") return visitorPart;
  return Prisma.sql`${contactPart} UNION ALL ${visitorPart}`;
}

/* The two queries behind one page. Exported for the Postgres
   test, which runs them against a real database. */
export function peopleQueries(shop: string, opts: { filter: PeopleFilterKey; q: string; page: number }) {
  const union = unionSql(shop, opts.filter, opts.q);
  const offset = (opts.page - 1) * PEOPLE_PAGE_SIZE;
  return {
    keys: Prisma.sql`SELECT kind, id FROM (${union}) people ORDER BY last_at DESC, id DESC LIMIT ${PEOPLE_PAGE_SIZE} OFFSET ${offset}`,
    count: Prisma.sql`SELECT COUNT(*) AS count FROM (${union}) people`,
  };
}

export async function listPeople(shop: string, opts: { filter: PeopleFilterKey; q: string; page: number }) {
  const queries = peopleQueries(shop, opts);

  const [keys, countRows] = await Promise.all([
    db.$queryRaw<Key[]>(queries.keys),
    db.$queryRaw<{ count: bigint | number }[]>(queries.count),
  ]);
  const total = Number(countRows[0]?.count ?? 0);

  const contactIds = keys.filter((k) => k.kind === "contact").map((k) => k.id);
  const visitorIds = keys.filter((k) => k.kind === "visitor").map((k) => k.id);

  const [contacts, contactVisitors, loneVisitors] = await Promise.all([
    contactIds.length ? db.contact.findMany({ where: { shop, id: { in: contactIds } } }) : Promise.resolve([]),
    contactIds.length
      ? db.visitor.findMany({ where: { shop, contactId: { in: contactIds } }, orderBy: { lastSeenAt: "desc" } })
      : Promise.resolve([]),
    visitorIds.length ? db.visitor.findMany({ where: { shop, id: { in: visitorIds } } }) : Promise.resolve([]),
  ]);

  const allVisitorIds = [...contactVisitors.map((v) => v.id), ...loneVisitors.map((v) => v.id)];
  const countsByVisitor = new Map<string, VisitorCounts>();
  if (allVisitorIds.length) {
    const grouped = await db.visitorEvent.groupBy({
      by: ["visitorId", "type"],
      where: { shop, visitorId: { in: allVisitorIds } },
      _count: { _all: true },
    });
    for (const g of grouped) {
      const c = countsByVisitor.get(g.visitorId) ?? emptyVisitorCounts();
      addVisitorCount(c, g.type, g._count._all);
      countsByVisitor.set(g.visitorId, c);
    }
  }

  const sumCounts = (vs: { id: string; visitCount: number }[]) => {
    const total = emptyVisitorCounts();
    for (const v of vs) {
      const c = countsByVisitor.get(v.id) ?? emptyVisitorCounts();
      total.pageViews += Math.max(c.pageViews, v.visitCount);
      total.popupsShown += c.popupsShown;
      total.clicks += c.clicks;
      total.closes += c.closes;
      total.signups += c.signups;
    }
    return total;
  };

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const visitorById = new Map(loneVisitors.map((v) => [v.id, v]));
  const visitorsOf = new Map<string, typeof contactVisitors>();
  for (const v of contactVisitors) {
    if (!v.contactId) continue;
    const list = visitorsOf.get(v.contactId) ?? [];
    list.push(v);
    visitorsOf.set(v.contactId, list);
  }

  const rows = keys
    .map((k) => {
      if (k.kind === "contact") {
        const c = contactById.get(k.id);
        if (!c) return null;
        const vs = visitorsOf.get(c.id) ?? [];
        const latest = vs[0] ?? null;
        const counts = sumCounts(vs);
        /* A signup from before tracking still counts as one. */
        if (counts.signups === 0) counts.signups = 1;
        const fields = c.fields && typeof c.fields === "object" && !Array.isArray(c.fields) ? (c.fields as Record<string, unknown>) : {};
        return {
          key: `c-${c.id}`,
          kind: "contact" as const,
          id: c.id,
          email: c.email,
          phone: c.phone,
          extra: Object.values(fields)
            .filter((v) => typeof v === "string" && v && v !== c.email && v !== c.phone)
            .join(" · "),
          popupName: c.popupName,
          signedUpAt: c.createdAt.toISOString(),
          lastActiveAt: (latest && latest.lastSeenAt > c.createdAt ? latest.lastSeenAt : c.createdAt).toISOString(),
          loggedIn: Boolean(c.shopifyCustomerId || vs.some((v) => v.shopifyCustomerId)),
          devices: vs.length,
          visitorId: latest?.id ?? null,
          anonymousId: latest?.anonymousId ?? null,
          source: latest?.source ?? null,
          device: latest?.device ?? null,
          browser: latest?.browser ?? null,
          os: latest?.os ?? null,
          country: latest?.country ?? null,
          referrer: vs.at(-1)?.referrer ?? null,
          utmSource: vs.at(-1)?.utmSource ?? null,
          utmMedium: vs.at(-1)?.utmMedium ?? null,
          counts,
        };
      }
      const v = visitorById.get(k.id);
      if (!v) return null;
      return {
        key: `v-${v.id}`,
        kind: "visitor" as const,
        id: v.id,
        email: null,
        phone: null,
        extra: "",
        popupName: null,
        signedUpAt: null,
        lastActiveAt: v.lastSeenAt.toISOString(),
        loggedIn: Boolean(v.shopifyCustomerId),
        devices: 1,
        visitorId: v.id,
        anonymousId: v.anonymousId,
        source: v.source,
        device: v.device,
        browser: v.browser,
        os: v.os,
        country: v.country,
        referrer: v.referrer,
        utmSource: v.utmSource,
        utmMedium: v.utmMedium,
        counts: sumCounts([v]),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return { total, rows };
}

export type PersonRow = Awaited<ReturnType<typeof listPeople>>["rows"][number];

/* Everything the Contacts page needs, and never throws: a failure
   shows an error on the page instead of breaking it. */
export async function loadPeoplePage(shop: string, url: URL) {
  const filter = normalizePeopleFilter(url.searchParams.get("filter"));
  const q = (url.searchParams.get("q") || "").slice(0, 200);
  const page = Math.max(1, Math.min(10_000, Number(url.searchParams.get("page")) || 1));

  const [contactTotal, anonymousTotal] = await Promise.all([
    db.contact.count({ where: { shop } }),
    db.visitor.count({ where: { shop, contactId: null } }),
  ]);

  try {
    const [list, summary] = await Promise.all([listPeople(shop, { filter, q, page }), visitorSummary(shop)]);
    return { ...list, summary, contactTotal, anonymousTotal, filter, q, page, loadError: false };
  } catch (error) {
    console.error("PEOPLE LIST ERROR:", error);
    return { total: 0, rows: [] as PersonRow[], summary: null, contactTotal, anonymousTotal, filter, q, page, loadError: true };
  }
}

export type PeoplePageData = Awaited<ReturnType<typeof loadPeoplePage>>;

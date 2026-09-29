import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = vi.hoisted(() => ({ visitors: [] as any[], events: [] as any[], contacts: [] as any[], campaigns: [] as any[] }));

function match(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, c]: [string, any]) => {
    if (k === "AND") return (c as any[]).every((w) => match(row, w));
    if (k === "OR") return (c as any[]).some((w) => match(row, w));
    if (c === null) return row[k] == null;
    if (c && typeof c === "object" && !(c instanceof Date)) {
      if ("in" in c) return c.in.includes(row[k]);
      if ("not" in c) return c.not === null ? row[k] != null : row[k] !== c.not;
      if ("gte" in c) return row[k] >= c.gte;
      if ("startsWith" in c) return String(row[k] ?? "").startsWith(c.startsWith);
      if ("contains" in c)
        return c.mode === "insensitive"
          ? String(row[k] ?? "").toLowerCase().includes(String(c.contains).toLowerCase())
          : String(row[k] ?? "").includes(c.contains);
    }
    return row[k] === c;
  });
}

vi.mock("../db.server", () => ({
  default: {
    visitor: {
      count: vi.fn(async ({ where }: any) => mem.visitors.filter((v) => match(v, where)).length),
      findMany: vi.fn(async ({ where, skip = 0, take = 1000 }: any) =>
        mem.visitors
          .filter((v) => match(v, where))
          .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
          .slice(skip, skip + take),
      ),
      findFirst: vi.fn(async ({ where }: any) => mem.visitors.find((v) => match(v, where)) ?? null),
    },
    visitorEvent: {
      groupBy: vi.fn(async ({ by, where }: any) => {
        const groups = new Map<string, any>();
        for (const e of mem.events.filter((x) => match(x, where))) {
          const key = by.map((k: string) => e[k]).join("|");
          const g = groups.get(key) ?? { ...Object.fromEntries(by.map((k: string) => [k, e[k]])), _count: { _all: 0 } };
          g._count._all++;
          groups.set(key, g);
        }
        return [...groups.values()];
      }),
      findMany: vi.fn(async ({ where, take }: any) =>
        mem.events
          .filter((e) => match(e, where))
          .sort((a, b) => b.occurredAt - a.occurredAt)
          .slice(0, take),
      ),
    },
    contact: {
      findMany: vi.fn(async ({ where }: any) => mem.contacts.filter((c) => match(c, where))),
      findFirst: vi.fn(async ({ where }: any) => mem.contacts.find((c) => match(c, where)) ?? null),
    },
    campaign: {
      findMany: vi.fn(async ({ where }: any) => mem.campaigns.filter((c) => match(c, where))),
    },
  },
}));

import { getVisitorDetail, listVisitors, visitorSummary } from "./visitor-list.server";

const SHOP = "demo.myshopify.com";
const OTHER = "other.myshopify.com";
const now = new Date("2026-09-29T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);

function visitor(id: string, extra: any = {}) {
  return {
    id,
    shop: SHOP,
    anonymousId: `${id.padEnd(8, "0")}-0000-4000-8000-000000000000`,
    contactId: null,
    shopifyCustomerId: null,
    identifiedAt: null,
    firstSeenAt: ago(1),
    lastSeenAt: ago(1),
    visitCount: 0,
    source: "shopify",
    device: "mobile",
    browser: "Safari",
    os: "iOS",
    country: "IN",
    referrer: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    firstPageUrl: "https://shop.com/",
    lastPageUrl: "https://shop.com/p",
    ...extra,
  };
}
let seq = 0;
const ev = (visitorId: string, type: string, extra: any = {}) =>
  mem.events.push({ id: `e${++seq}`, shop: SHOP, visitorId, type, occurredAt: new Date(now.getTime() - 3600_000 + seq), pageUrl: null, campaignId: null, meta: null, ...extra });

beforeEach(() => {
  seq = 0;
  mem.contacts = [{ id: "con_1", shop: SHOP, email: "jane@store.com", phone: null, createdAt: ago(1) }];
  mem.campaigns = [{ id: "cmp_1", shop: SHOP, name: "Fall sale" }];
  mem.visitors = [
    visitor("aaaa1111", { lastSeenAt: ago(0.1), visitCount: 3 }),
    visitor("bbbb2222", { contactId: "con_1", lastSeenAt: ago(0.2), identifiedAt: ago(0.2) }),
    visitor("cccc3333", { shopifyCustomerId: "701", lastSeenAt: ago(9), firstSeenAt: ago(20) }),
    visitor("dddd4444", { shop: OTHER }),
  ];
  mem.events = [];
  ev("aaaa1111", "page_view");
  ev("aaaa1111", "page_view");
  ev("aaaa1111", "popup_shown", { campaignId: "cmp_1" });
  ev("aaaa1111", "popup_clicked", { campaignId: "cmp_1", meta: { label: "Get my code" } });
  ev("aaaa1111", "popup_closed", { campaignId: "cmp_1" });
  ev("bbbb2222", "popup_submitted", { campaignId: "cmp_1" });
  mem.events.push({ id: "other", shop: OTHER, visitorId: "dddd4444", type: "popup_clicked", occurredAt: now, meta: null });
});

describe("listVisitors", () => {
  it("lists every visitor of the shop, newest activity first, with what they did", async () => {
    const { total, rows } = await listVisitors(SHOP, { filter: "all", q: "", page: 1 });
    expect(total).toBe(3);
    expect(rows.map((r) => r.id)).toEqual(["aaaa1111", "bbbb2222", "cccc3333"]);
    expect(rows[0].counts).toEqual({ pageViews: 3, popupsShown: 1, clicks: 1, closes: 1, signups: 0 });
    expect(rows[1]).toMatchObject({ contact: { email: "jane@store.com" }, counts: { signups: 1 } });
    expect(rows[2].loggedIn).toBe(true);
  });

  it("filters anonymous, signed up and logged in visitors", async () => {
    const ids = async (filter: any) => (await listVisitors(SHOP, { filter, q: "", page: 1 })).rows.map((r) => r.id);
    expect(await ids("anonymous")).toEqual(["aaaa1111", "cccc3333"]);
    expect(await ids("identified")).toEqual(["bbbb2222"]);
    expect(await ids("logged_in")).toEqual(["cccc3333"]);
  });

  it("searches by contact email, visitor id prefix or customer id, never across shops", async () => {
    const ids = async (q: string) => (await listVisitors(SHOP, { filter: "all", q, page: 1 })).rows.map((r) => r.id);
    expect(await ids("JANE@")).toEqual(["bbbb2222"]);
    expect(await ids("aaaa")).toEqual(["aaaa1111"]);
    expect(await ids("701")).toEqual(["cccc3333"]);
    expect(await ids("dddd")).toEqual([]);
    expect(await ids("nobody here")).toEqual([]);
  });
});

describe("visitorSummary", () => {
  it("counts the last 7 days for this shop only", async () => {
    expect(await visitorSummary(SHOP, now)).toEqual({ active: 2, newVisitors: 2, identified: 1, popupsShown: 1, clicks: 1, signups: 1 });
  });
});

describe("getVisitorDetail", () => {
  it("returns the visitor, their contact and the timeline newest first, with what was clicked", async () => {
    const d = await getVisitorDetail(SHOP, "aaaa1111");
    expect(d?.events.map((e) => e.type)).toEqual(["popup_closed", "popup_clicked", "popup_shown", "page_view", "page_view"]);
    expect(d?.events[1]).toMatchObject({ campaignName: "Fall sale", detail: 'Clicked "Get my code"' });
    expect(d?.contact).toBeNull();
    expect((await getVisitorDetail(SHOP, "bbbb2222"))?.contact?.email).toBe("jane@store.com");
  });

  it("does not show another shop's visitor", async () => {
    expect(await getVisitorDetail(SHOP, "dddd4444")).toBeNull();
  });
});

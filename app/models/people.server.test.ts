/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = vi.hoisted(() => ({ keys: [] as any[], count: 0, contacts: [] as any[], visitors: [] as any[], events: [] as any[] }));

vi.mock("../db.server", () => ({
  default: {
    $queryRaw: vi.fn(async (q: any) => (String(q.sql).includes("COUNT(*)") ? [{ count: BigInt(mem.count) }] : mem.keys)),
    contact: {
      findMany: vi.fn(async ({ where }: any) => mem.contacts.filter((c) => where.id.in.includes(c.id))),
      count: vi.fn(async () => mem.contacts.length),
    },
    visitor: {
      findMany: vi.fn(async ({ where }: any) =>
        mem.visitors
          .filter((v) => (where.contactId ? where.contactId.in.includes(v.contactId) : where.id.in.includes(v.id)))
          .sort((a, b) => b.lastSeenAt - a.lastSeenAt),
      ),
      count: vi.fn(async () => mem.visitors.filter((v) => !v.contactId).length),
    },
    visitorEvent: {
      groupBy: vi.fn(async ({ where }: any) => {
        const m = new Map<string, any>();
        for (const e of mem.events.filter((x) => where.visitorId.in.includes(x.visitorId))) {
          const k = e.visitorId + "|" + e.type;
          const g = m.get(k) ?? { visitorId: e.visitorId, type: e.type, _count: { _all: 0 } };
          g._count._all++;
          m.set(k, g);
        }
        return [...m.values()];
      }),
    },
  },
}));
vi.mock("./visitor-list.server", () => ({ visitorSummary: vi.fn(async () => ({ active: 2, clicks: 3 })) }));

import { listPeople, loadPeoplePage, peopleQueries } from "./people.server";
import { normalizePeopleFilter } from "./people";

const t = (h: number) => new Date(Date.UTC(2026, 8, 30, h));
const v = (id: string, extra: any) => ({ id, anonymousId: `${id}-0000-4000-8000-000000000000`, contactId: null, shopifyCustomerId: null, visitCount: 0, source: "shopify", device: "mobile", browser: "Safari", os: "iOS", country: "IN", referrer: null, utmSource: null, utmMedium: null, lastSeenAt: t(1), ...extra });

beforeEach(() => {
  mem.contacts = [
    { id: "c_jane", email: "jane@store.com", phone: null, popupName: "Welcome", fields: { name: "Jane", email: "jane@store.com" }, createdAt: t(10), shopifyCustomerId: null },
    { id: "c_old", email: null, phone: "+15550102030", popupName: null, fields: {}, createdAt: t(8), shopifyCustomerId: null },
  ];
  mem.visitors = [
    v("vphone", { contactId: "c_jane", lastSeenAt: t(11), visitCount: 2 }),
    v("vlaptop", { contactId: "c_jane", lastSeenAt: t(15), visitCount: 1, shopifyCustomerId: "701", device: "desktop", browser: "Chrome", os: "macOS" }),
    v("vanon", { lastSeenAt: t(13), visitCount: 3, utmSource: "ig" }),
  ];
  mem.events = [
    { visitorId: "vphone", type: "popup_clicked" },
    { visitorId: "vlaptop", type: "popup_clicked" },
    { visitorId: "vphone", type: "popup_submitted" },
    { visitorId: "vanon", type: "popup_shown" },
  ];
  mem.keys = [
    { kind: "contact", id: "c_jane" },
    { kind: "visitor", id: "vanon" },
    { kind: "contact", id: "c_old" },
  ];
  mem.count = 3;
});

describe("people list", () => {
  it("builds one row per person, adding up a contact's devices", async () => {
    const { total, rows } = await listPeople("s", { filter: "all", q: "", page: 1 });
    expect(total).toBe(3);
    expect(rows.map((r) => r.key)).toEqual(["c-c_jane", "v-vanon", "c-c_old"]);
    expect(rows[0]).toMatchObject({ kind: "contact", email: "jane@store.com", devices: 2, loggedIn: true, extra: "Jane", browser: "Chrome", visitorId: "vlaptop" });
    expect(rows[0].counts).toMatchObject({ pageViews: 3, clicks: 2, signups: 1 });
    expect(rows[0].lastActiveAt).toBe(t(15).toISOString());
    expect(rows[1]).toMatchObject({ kind: "visitor", utmSource: "ig", devices: 1 });
    expect(rows[1].counts).toMatchObject({ pageViews: 3, popupsShown: 1, signups: 0 });
    // Signed up before tracking: no visits, still one signup.
    expect(rows[2]).toMatchObject({ visitorId: null, devices: 0 });
    expect(rows[2].counts.signups).toBe(1);
  });

  it("builds the page data with totals and survives a failing query", async () => {
    const ok = await loadPeoplePage("s", new URL("https://x/app/contacts?filter=identified&q=ja&page=0"));
    expect(ok).toMatchObject({ filter: "signed_up", q: "ja", page: 1, contactTotal: 2, anonymousTotal: 1, loadError: false });
    mem.keys = null as any;
    const bad = await loadPeoplePage("s", new URL("https://x/app/contacts"));
    expect(bad).toMatchObject({ loadError: true, rows: [] });
  });

  it("maps filters and keeps the shop in every query part", () => {
    expect(normalizePeopleFilter("anonymous")).toBe("anonymous");
    expect(normalizePeopleFilter("nope")).toBe("all");
    const q = peopleQueries("shop-a", { filter: "all", q: "", page: 3 });
    expect(q.keys.values.filter((x) => x === "shop-a").length).toBeGreaterThanOrEqual(2);
    expect(q.keys.values).toContain(50);
    expect(q.keys.sql).toMatch(/UNION ALL/);
    expect(peopleQueries("shop-a", { filter: "anonymous", q: "", page: 1 }).keys.sql).not.toMatch(/"Contact"/);
  });
});

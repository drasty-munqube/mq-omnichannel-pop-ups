import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------
   In-memory tables for the queries these functions use.
------------------------------------------------------------ */

const mem = vi.hoisted(() => ({
  visitors: [] as any[],
  events: [] as any[],
  contacts: [] as any[],
  campaigns: [] as any[],
  deliveries: [] as any[],
  emailEvents: [] as any[],
  popupEvents: [] as any[],
  seq: 0,
}));

function match(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, c]: [string, any]) => {
    if (k === "OR") return (c as any[]).some((w) => match(row, w));
    if (c && typeof c === "object" && !(c instanceof Date)) {
      if ("in" in c) return c.in.includes(row[k]);
      if ("equals" in c) return c.mode === "insensitive" ? String(row[k] ?? "").toLowerCase() === String(c.equals).toLowerCase() : row[k] === c.equals;
    }
    if (c === null) return row[k] == null;
    return row[k] === c;
  });
}
const sortBy = (rows: any[], orderBy: any) => {
  if (!orderBy) return rows;
  const [[k, dir]] = Object.entries(orderBy) as [string, string][];
  return [...rows].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === "desc" ? -1 : 1));
};
const id = (p: string) => `${p}${++mem.seq}`;

function applyData(row: any, data: any) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in (v as any)) row[k] = (row[k] || 0) + (v as any).increment;
    else row[k] = v;
  }
}

vi.mock("../db.server", () => ({
  default: {
    visitor: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const { shop, anonymousId } = where.shop_anonymousId;
        let row = mem.visitors.find((v) => v.shop === shop && v.anonymousId === anonymousId);
        if (row) applyData(row, update);
        else {
          row = { id: id("vis"), contactId: null, identifiedAt: null, ...create };
          mem.visitors.push(row);
        }
        return { ...row };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = mem.visitors.find((v) => v.id === where.id);
        applyData(row, data);
        return row;
      }),
      findMany: vi.fn(async ({ where, orderBy }: any) => sortBy(mem.visitors.filter((v) => match(v, where)), orderBy)),
      deleteMany: vi.fn(async ({ where }: any) => {
        const n = mem.visitors.length;
        mem.visitors = mem.visitors.filter((v) => !match(v, where));
        return { count: n - mem.visitors.length };
      }),
    },
    visitorEvent: {
      createMany: vi.fn(async ({ data, skipDuplicates }: any) => {
        let count = 0;
        for (const d of data) {
          if (mem.events.some((e) => e.eventId === d.eventId)) {
            if (skipDuplicates) continue;
            throw Object.assign(new Error("dup"), { code: "P2002" });
          }
          mem.events.push({ id: id("ev"), meta: null, ...d });
          count++;
        }
        return { count };
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: id("ev"), meta: null, ...data };
        mem.events.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hit = mem.events.filter((e) => match(e, where));
        hit.forEach((e) => applyData(e, data));
        return { count: hit.length };
      }),
      findMany: vi.fn(async ({ where, orderBy }: any) => sortBy(mem.events.filter((e) => match(e, where)), orderBy)),
      deleteMany: vi.fn(async ({ where }: any) => {
        const n = mem.events.length;
        mem.events = mem.events.filter((e) => !match(e, where));
        return { count: n - mem.events.length };
      }),
    },
    contact: {
      findFirst: vi.fn(async ({ where, orderBy }: any) => sortBy(mem.contacts.filter((c) => match(c, where)), orderBy)[0] ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const row = mem.contacts.find((c) => c.id === where.id);
        applyData(row, data);
        return row;
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: id("con"), createdAt: new Date(Date.now() + mem.seq), ...data };
        mem.contacts.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: any) => mem.contacts.filter((c) => match(c, where))),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hit = mem.contacts.filter((c) => match(c, where));
        hit.forEach((c) => applyData(c, data));
        return { count: hit.length };
      }),
    },
    emailEvent: {
      findMany: vi.fn(async ({ where, orderBy }: any) => sortBy(mem.emailEvents.filter((e) => match(e, where)), orderBy)),
    },
    campaign: {
      findMany: vi.fn(async ({ where }: any) => mem.campaigns.filter((c) => match(c, where)).map((c) => ({ id: c.id, name: c.name }))),
      findFirst: vi.fn(async ({ where }: any) => mem.campaigns.find((c) => match(c, where)) ?? null),
    },
    popupEvent: {
      create: vi.fn(async ({ data }: any) => (mem.popupEvents.push(data), data)),
    },
    discountDelivery: {
      create: vi.fn(async ({ data }: any) => {
        if (mem.deliveries.some((d) => d.contactId === data.contactId && d.channel === data.channel)) {
          throw new Error("Unique constraint failed on the fields: (`contactId`,`channel`)");
        }
        const row = { id: id("del"), ...data };
        mem.deliveries.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: any) => mem.deliveries.filter((d) => match(d, where))),
    },
  },
}));

vi.mock("./delivery.server", async () => {
  const db = (await import("../db.server")).default as any;
  return {
    kickDeliveries: vi.fn(),
    /* Same guard as the real one: the unique index on
       (contactId, channel) means one coupon email per contact. */
    queueCouponDelivery: vi.fn(async (input: any) => {
      try {
        return await db.discountDelivery.create({ data: { ...input, channel: "email" } });
      } catch {
        return null;
      }
    }),
  };
});

import { saveSubmission } from "./popup-widget.server";
import {
  eraseVisitorsForContacts,
  getContactJourney,
  identifyVisitor,
  linkShopifyCustomer,
  recordPopupVisitorEvent,
  resolveContact,
  trackVisitor,
} from "./visitors.server";
import { validateTrackPayload } from "./visitor-tracking";

const SHOP = "demo.myshopify.com";
const OTHER = "other.myshopify.com";
const PHONE_AID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const LAPTOP_AID = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function track(anonymousId: string, events: any[], context: any = {}) {
  const r = validateTrackPayload({ anonymousId, context, events });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

beforeEach(() => {
  mem.visitors = [];
  mem.events = [];
  mem.contacts = [];
  mem.deliveries = [];
  mem.emailEvents = [];
  mem.popupEvents = [];
  mem.seq = 0;
  mem.campaigns = [
    { id: "cmp_1", shop: SHOP, name: "Fall sale", rewardDiscountCode: "FALL10" },
    { id: "cmp_x", shop: OTHER, name: "Theirs" },
  ];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("trackVisitor (anonymous user creation)", () => {
  it("creates the visitor on first sight with its context, then reuses it", async () => {
    const first = await trackVisitor(
      SHOP,
      "external",
      track(PHONE_AID, [{ eventId: uuid(1), type: "page_view", campaignId: "cmp_1" }], {
        pageUrl: "https://site.com/?utm_source=ig&utm_campaign=fall",
        referrer: "https://instagram.com/",
        device: "mobile",
      }),
      { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1", country: "IN" },
    );
    expect(first.stored).toBe(1);
    expect(mem.visitors).toHaveLength(1);
    expect(mem.visitors[0]).toMatchObject({
      shop: SHOP,
      anonymousId: PHONE_AID,
      visitCount: 1,
      firstPageUrl: "https://site.com/?utm_source=ig&utm_campaign=fall",
      referrer: "https://instagram.com/",
      utmSource: "ig",
      utmCampaign: "fall",
      device: "mobile",
      browser: "Safari",
      os: "iOS",
      country: "IN",
    });

    await trackVisitor(SHOP, "external", track(PHONE_AID, [{ eventId: uuid(2), type: "page_view" }], { pageUrl: "https://site.com/p2", referrer: "https://google.com/" }));
    expect(mem.visitors).toHaveLength(1);
    expect(mem.visitors[0]).toMatchObject({ visitCount: 2, lastPageUrl: "https://site.com/p2", referrer: "https://instagram.com/" });
  });

  it("keeps shops apart: the same anonymous id is a different visitor per shop", async () => {
    await trackVisitor(SHOP, "external", track(PHONE_AID, [{ eventId: uuid(1), type: "page_view" }]));
    await trackVisitor(OTHER, "external", track(PHONE_AID, [{ eventId: uuid(2), type: "page_view" }]));
    expect(mem.visitors.map((v) => v.shop)).toEqual([SHOP, OTHER]);
  });

  it("stores each event once, even when the batch is sent twice", async () => {
    const batch = track(PHONE_AID, [
      { eventId: uuid(1), type: "page_view", campaignId: "cmp_1" },
      { eventId: uuid(2), type: "popup_shown", campaignId: "cmp_1", popupId: "pop_1" },
    ]);
    expect((await trackVisitor(SHOP, "external", batch)).stored).toBe(2);
    expect((await trackVisitor(SHOP, "external", batch)).stored).toBe(0);
    expect(mem.events).toHaveLength(2);
    expect(mem.events[1]).toMatchObject({ campaignId: "cmp_1", popupId: "pop_1", type: "popup_shown", shop: SHOP });
  });

  it("drops popup events for another shop's campaign and strips it from page views", async () => {
    await trackVisitor(
      SHOP,
      "external",
      track(PHONE_AID, [
        { eventId: uuid(1), type: "popup_shown", campaignId: "cmp_x" },
        { eventId: uuid(2), type: "page_view", campaignId: "cmp_x" },
      ]),
    );
    expect(mem.events).toHaveLength(1);
    expect(mem.events[0]).toMatchObject({ type: "page_view", campaignId: null });
  });

  it("stores a popup click with the button text", async () => {
    await trackVisitor(
      SHOP,
      "shopify",
      track(PHONE_AID, [
        { eventId: uuid(1), type: "popup_clicked", campaignId: "cmp_1", popupId: "pop_1", label: "Get my code" },
        { eventId: uuid(2), type: "popup_clicked", campaignId: "cmp_x", label: "Theirs" },
      ]),
    );
    expect(mem.events).toHaveLength(1);
    expect(mem.events[0]).toMatchObject({ type: "popup_clicked", campaignId: "cmp_1", meta: { label: "Get my code" } });
  });

  it("records popup shown / closed from the existing event requests", async () => {
    expect(await recordPopupVisitorEvent(SHOP, "shopify", { anonymousId: PHONE_AID, type: "view", campaignId: "cmp_1", popupId: "pop_1" })).toBe(true);
    expect(await recordPopupVisitorEvent(SHOP, "shopify", { anonymousId: PHONE_AID, type: "dismiss", campaignId: "cmp_1" })).toBe(true);
    expect(await recordPopupVisitorEvent(SHOP, "shopify", { type: "view", campaignId: "cmp_1" })).toBe(false);
    expect(await recordPopupVisitorEvent(SHOP, "shopify", { anonymousId: PHONE_AID, type: "view", campaignId: "cmp_x" })).toBe(false);
    expect(mem.events.map((e) => e.type)).toEqual(["popup_shown", "popup_closed"]);
    expect(mem.visitors[0].source).toBe("shopify");
  });
});

describe("funnel events", () => {
  it("writes the submit event with email and phone flags, and never takes a submit from the browser", async () => {
    const { recordEvent } = await import("./popup-widget.server");
    expect(await recordEvent(SHOP, "shopify", { type: "submit", campaignId: "cmp_1" })).toBe(false);
    expect(await recordEvent(SHOP, "shopify", { type: "open", campaignId: "cmp_1", hasEmail: true } as any)).toBe(true);
    expect(mem.popupEvents.at(-1)).not.toHaveProperty("hasEmail");

    await saveSubmission(SHOP, { campaignId: "cmp_1", email: "a@b.co", fields: {} }, "shopify");
    await saveSubmission(SHOP, { campaignId: "cmp_1", phone: "+15550102030", fields: {} }, "shopify");
    expect(mem.popupEvents.filter((e) => e.type === "submit").map((e) => [e.hasEmail, e.hasPhone])).toEqual([
      [true, false],
      [false, true],
    ]);
  });
});

describe("test submissions", () => {
  it("saves the contact but leaves it out of the numbers", async () => {
    await saveSubmission(SHOP, { campaignId: "cmp_1", email: "me@test.com", fields: {}, test: true, anonymousId: PHONE_AID }, "shopify");
    expect(mem.contacts).toHaveLength(1);
    expect(mem.popupEvents.filter((e) => e.type === "submit")).toHaveLength(0);
    expect(mem.visitors).toHaveLength(0);
  });
});

describe("resolveContact", () => {
  it("reuses a contact by email (any case) and merges fields", async () => {
    const a = await resolveContact(SHOP, { email: "Jane@Store.com", fields: { name: "Jane" } });
    const b = await resolveContact(SHOP, { email: "jane@store.com ", fields: { city: "Pune" } });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.contact.id).toBe(a.contact.id);
    expect(mem.contacts).toHaveLength(1);
    expect(mem.contacts[0].fields).toEqual({ name: "Jane", city: "Pune" });
    expect(mem.contacts[0].email).toBe("jane@store.com");
  });

  it("falls back to phone, and never matches another shop", async () => {
    const a = await resolveContact(SHOP, { phone: "+1 555 010 2030" });
    const b = await resolveContact(SHOP, { phone: "+1 555 010 2030" });
    const c = await resolveContact(OTHER, { phone: "+1 555 010 2030" });
    expect(b.contact.id).toBe(a.contact.id);
    expect(c.contact.id).not.toBe(a.contact.id);
  });
});

describe("identify and merge", () => {
  it("links the visitor to a new contact and gives it the whole journey", async () => {
    await trackVisitor(SHOP, "external", track(PHONE_AID, [{ eventId: uuid(1), type: "page_view", campaignId: "cmp_1" }]));
    await recordPopupVisitorEvent(SHOP, "external", { anonymousId: PHONE_AID, type: "view", campaignId: "cmp_1" });

    await saveSubmission(SHOP, { anonymousId: PHONE_AID, campaignId: "cmp_1", popupId: "pop_1", email: "jane@store.com", fields: {}, pageUrl: "https://site.com/" }, "external");

    const contact = mem.contacts[0];
    expect(mem.visitors[0]).toMatchObject({ contactId: contact.id });
    expect(mem.visitors[0].identifiedAt).toBeInstanceOf(Date);
    expect(mem.events.map((e) => [e.type, e.contactId])).toEqual([
      ["page_view", contact.id],
      ["popup_shown", contact.id],
      ["popup_submitted", contact.id],
      ["identified", contact.id],
    ]);
    // Analytics still gets its submit event, and the coupon is queued.
    expect(mem.popupEvents.map((e) => e.type)).toEqual(["submit"]);
    expect(mem.deliveries).toHaveLength(1);

    // Events after identification carry the contact straight away.
    await trackVisitor(SHOP, "external", track(PHONE_AID, [{ eventId: uuid(9), type: "page_view", occurredAt: new Date(Date.now() + 2000).toISOString() }]));
    expect(mem.events.at(-1)).toMatchObject({ type: "page_view", contactId: contact.id });

    const journey = await getContactJourney(SHOP, contact.id);
    expect(journey?.events.map((e) => e.type)).toEqual(["page_view", "popup_shown", "popup_submitted", "identified", "page_view"]);
    expect(journey?.visitors).toHaveLength(1);
    expect(journey?.events[0].campaignName).toBe("Fall sale");
  });

  it("links a second device with the same email to the same contact, one coupon only", async () => {
    await trackVisitor(SHOP, "external", track(PHONE_AID, [{ eventId: uuid(1), type: "page_view" }]));
    await saveSubmission(SHOP, { anonymousId: PHONE_AID, campaignId: "cmp_1", email: "jane@store.com", fields: {} }, "external");

    await trackVisitor(SHOP, "external", track(LAPTOP_AID, [{ eventId: uuid(2), type: "page_view" }]));
    await saveSubmission(SHOP, { anonymousId: LAPTOP_AID, campaignId: "cmp_1", email: "JANE@store.com", fields: {} }, "external");

    expect(mem.contacts).toHaveLength(1);
    const contactId = mem.contacts[0].id;
    expect(mem.visitors.map((v) => v.contactId)).toEqual([contactId, contactId]);
    expect(mem.deliveries).toHaveLength(1);

    const journey = await getContactJourney(SHOP, contactId);
    expect(journey?.visitors.map((v) => v.anonymousId)).toEqual([PHONE_AID, LAPTOP_AID]);
    expect(journey?.events.filter((e) => e.type === "page_view")).toHaveLength(2);
  });

  it("moves a visitor to a new contact when they later use a different email", async () => {
    await trackVisitor(SHOP, "external", track(PHONE_AID, [{ eventId: uuid(1), type: "page_view" }]));
    await saveSubmission(SHOP, { anonymousId: PHONE_AID, campaignId: "cmp_1", email: "old@mail.com", fields: {} }, "external");
    const oldId = mem.contacts[0].id;

    await trackVisitor(SHOP, "external", track(PHONE_AID, [{ eventId: uuid(2), type: "page_view", occurredAt: new Date(Date.now() + 2000).toISOString() }]));
    const r = await identifyVisitor(SHOP, { anonymousId: PHONE_AID, contactId: (await resolveContact(SHOP, { email: "new@mail.com" })).contact.id, source: "external" });
    const newId = mem.contacts[1].id;

    expect(r).toMatchObject({ linked: true, changed: true, previousContactId: oldId });
    expect(mem.visitors[0].contactId).toBe(newId);
    // The first page view stays with the old contact; the one after the old signup stays there too.
    const oldJourney = await getContactJourney(SHOP, oldId);
    const newJourney = await getContactJourney(SHOP, newId);
    expect(oldJourney?.events.map((e) => e.type)).toEqual(["page_view", "popup_submitted", "identified", "page_view"]);
    expect(newJourney?.events.map((e) => e.type)).toEqual(["popup_submitted", "identified"]);
    expect(mem.events.at(-1)?.meta).toEqual({ previousContactId: oldId });
  });

  it("creates the visitor at signup if its first events never arrived", async () => {
    await saveSubmission(SHOP, { anonymousId: PHONE_AID, campaignId: "cmp_1", email: "a@b.co", fields: {} }, "external");
    expect(mem.visitors).toHaveLength(1);
    expect(mem.visitors[0].contactId).toBe(mem.contacts[0].id);
  });

  it("still saves the signup when there is no or a bad anonymous id", async () => {
    await saveSubmission(SHOP, { campaignId: "cmp_1", email: "a@b.co", fields: {} }, "external");
    await saveSubmission(SHOP, { anonymousId: "nope", campaignId: "cmp_1", email: "c@d.co", fields: {} }, "external");
    expect(mem.contacts).toHaveLength(2);
    expect(mem.visitors).toHaveLength(0);
  });
});

describe("privacy erasure", () => {
  it("removes a contact's visitors and all their events", async () => {
    await trackVisitor(SHOP, "external", track(PHONE_AID, [{ eventId: uuid(1), type: "page_view" }]));
    await saveSubmission(SHOP, { anonymousId: PHONE_AID, campaignId: "cmp_1", email: "a@b.co", fields: {} }, "external");
    await trackVisitor(SHOP, "external", track(LAPTOP_AID, [{ eventId: uuid(2), type: "page_view" }]));

    await eraseVisitorsForContacts(SHOP, [mem.contacts[0].id]);
    expect(mem.visitors.map((v) => v.anonymousId)).toEqual([LAPTOP_AID]);
    expect(mem.events.every((e) => e.anonymousId === LAPTOP_AID)).toBe(true);
  });
});

describe("logged-in Shopify customers", () => {
  const CUSTOMER = "7012345678901";
  const later = (ms: number) => new Date(Date.now() + ms).toISOString();

  it("remembers the customer on a logged-in signup, then links their other devices on sight", async () => {
    await trackVisitor(SHOP, "shopify", track(PHONE_AID, [{ eventId: uuid(1), type: "page_view" }]), { shopifyCustomerId: CUSTOMER });
    await saveSubmission(SHOP, { anonymousId: PHONE_AID, campaignId: "cmp_1", email: "jane@store.com", fields: {} }, "shopify", {
      shopifyCustomerId: CUSTOMER,
    });
    const contactId = mem.contacts[0].id;
    expect(mem.contacts[0].shopifyCustomerId).toBe(CUSTOMER);

    // A new laptop, logged in to the store, never fills the popup.
    await trackVisitor(SHOP, "shopify", track(LAPTOP_AID, [{ eventId: uuid(2), type: "page_view", occurredAt: later(3000) }]), {
      shopifyCustomerId: CUSTOMER,
    });
    const laptop = mem.visitors.find((v) => v.anonymousId === LAPTOP_AID);
    expect(laptop?.contactId).toBe(contactId);
    expect(mem.events.filter((e) => e.anonymousId === LAPTOP_AID).map((e) => [e.type, e.contactId])).toEqual([
      ["identified", contactId],
      ["page_view", contactId],
    ]);

    const journey = await getContactJourney(SHOP, contactId);
    expect(journey?.contact.shopifyCustomerId).toBe(CUSTOMER);
    expect(journey?.visitors.map((v) => [v.anonymousId, v.loggedIn])).toEqual([
      [PHONE_AID, true],
      [LAPTOP_AID, true],
    ]);
    expect(journey?.events.find((e) => e.type === "identified" && e.anonymousId === LAPTOP_AID)?.detail).toBe(
      "Recognised from their store login",
    );
  });

  it("links logged-in visits from before the signup on other devices", async () => {
    await trackVisitor(SHOP, "shopify", track(LAPTOP_AID, [{ eventId: uuid(1), type: "page_view" }]), { shopifyCustomerId: CUSTOMER });
    await trackVisitor(SHOP, "shopify", track(PHONE_AID, [{ eventId: uuid(2), type: "page_view" }]), { shopifyCustomerId: CUSTOMER });
    expect(mem.visitors.every((v) => v.contactId === null)).toBe(true);

    await saveSubmission(SHOP, { anonymousId: PHONE_AID, campaignId: "cmp_1", email: "jane@store.com", fields: {} }, "shopify", {
      shopifyCustomerId: CUSTOMER,
    });
    const contactId = mem.contacts[0].id;
    expect(mem.visitors.map((v) => v.contactId)).toEqual([contactId, contactId]);
    expect(mem.events.find((e) => e.anonymousId === LAPTOP_AID)?.contactId).toBe(contactId);
  });

  it("never creates a contact from a login alone, and ignores a bad customer id", async () => {
    await trackVisitor(SHOP, "shopify", track(PHONE_AID, [{ eventId: uuid(1), type: "page_view" }]), { shopifyCustomerId: CUSTOMER });
    await trackVisitor(SHOP, "shopify", track(LAPTOP_AID, [{ eventId: uuid(2), type: "page_view" }]), { shopifyCustomerId: "1 OR 1=1" });
    expect(mem.contacts).toHaveLength(0);
    expect(mem.visitors.map((v) => v.shopifyCustomerId)).toEqual([CUSTOMER, null]);
    expect(await linkShopifyCustomer(SHOP, "con_x", "")).toBe(0);
  });

  it("keeps a store's customer ids to that store", async () => {
    await saveSubmission(SHOP, { anonymousId: PHONE_AID, campaignId: "cmp_1", email: "jane@store.com", fields: {} }, "shopify", {
      shopifyCustomerId: CUSTOMER,
    });
    await trackVisitor(OTHER, "shopify", track(LAPTOP_AID, [{ eventId: uuid(2), type: "page_view" }]), { shopifyCustomerId: CUSTOMER });
    expect(mem.visitors.find((v) => v.shop === OTHER)?.contactId).toBeNull();
  });

  it("erases logged-in visitors by customer id, even without a signup", async () => {
    await trackVisitor(SHOP, "shopify", track(PHONE_AID, [{ eventId: uuid(1), type: "page_view" }]), { shopifyCustomerId: CUSTOMER });
    await trackVisitor(SHOP, "shopify", track(LAPTOP_AID, [{ eventId: uuid(2), type: "page_view" }]));
    await eraseVisitorsForContacts(SHOP, [], Number(CUSTOMER));
    expect(mem.visitors.map((v) => v.anonymousId)).toEqual([LAPTOP_AID]);
    expect(mem.events.map((e) => e.anonymousId)).toEqual([LAPTOP_AID]);
  });
});

describe("journey for contacts from before visitor tracking", () => {
  it("shows the saved signup and the discount email history", async () => {
    const signedUp = new Date("2026-09-01T10:00:00Z");
    mem.contacts.push(
      { id: "con_old", shop: SHOP, email: "old@shop.com", phone: null, createdAt: signedUp, pageUrl: "https://shop.com/", popupName: "Welcome", campaignId: "cmp_1" },
      // An older duplicate row for the same person, from before one contact per email.
      { id: "con_dup", shop: SHOP, email: "OLD@shop.com", phone: null, createdAt: new Date("2026-08-01T10:00:00Z"), pageUrl: null, popupName: null, campaignId: null },
      { id: "con_else", shop: SHOP, email: "someone@else.com", phone: null, createdAt: signedUp },
    );
    mem.deliveries.push({
      id: "del_1",
      shop: SHOP,
      contactId: "con_old",
      campaignId: "cmp_1",
      channel: "email",
      status: "sent",
      sentAt: new Date("2026-09-01T10:00:05Z"),
      deliveredAt: new Date("2026-09-01T10:00:09Z"),
      openedAt: new Date("2026-09-01T11:00:00Z"),
      clickedAt: null,
      bouncedAt: null,
      complainedAt: null,
      error: null,
    });
    mem.emailEvents.push(
      { id: "ee_1", shop: SHOP, deliveryId: "del_1", type: "email.clicked", occurredAt: new Date("2026-09-01T11:01:00Z"), link: "https://shop.com/cart", reason: null },
      { id: "ee_2", shop: SHOP, deliveryId: "del_1", type: "email.delivered", occurredAt: new Date("2026-09-01T10:00:08Z"), link: null, reason: null },
    );

    const journey = await getContactJourney(SHOP, "con_old");
    expect(journey?.visitors).toHaveLength(0);
    expect(journey?.events.map((e) => [e.type, e.saved])).toEqual([
      ["popup_submitted", true],
      ["popup_submitted", true],
      ["email_sent", true],
      ["email_delivered", false],
      ["email_opened", true],
      ["email_clicked", false],
    ]);
    expect(journey?.events[1]).toMatchObject({ campaignName: "Fall sale", detail: "Popup: Welcome", pageUrl: "https://shop.com/" });
    expect(journey?.events.at(-1)).toMatchObject({ detail: "https://shop.com/cart", campaignName: "Fall sale" });
  });

  it("does not add a saved signup next to a tracked one", async () => {
    await trackVisitor(SHOP, "external", track(PHONE_AID, [{ eventId: uuid(1), type: "page_view" }]));
    await saveSubmission(SHOP, { anonymousId: PHONE_AID, campaignId: "cmp_1", email: "jane@store.com", fields: {} }, "external");
    const journey = await getContactJourney(SHOP, mem.contacts[0].id);
    expect(journey?.events.filter((e) => e.type === "popup_submitted")).toHaveLength(1);
    expect(journey?.events.every((e) => !e.saved)).toBe(true);
  });
});

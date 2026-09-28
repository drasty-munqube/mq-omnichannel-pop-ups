import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------
   In-memory stand-ins for the tables the webhook touches.
------------------------------------------------------------ */

type Delivery = {
  id: string;
  shop: string;
  channel: string;
  destination: string;
  status: string;
  providerId: string | null;
  lastEvent: string | null;
  lastEventAt: Date | null;
  error: string | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
};

const mem = vi.hoisted(() => ({
  deliveries: [] as any[],
  events: [] as any[],
  suppressions: [] as any[],
}));

function match(row: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

vi.mock("../db.server", () => ({
  default: {
    discountDelivery: {
      findFirst: vi.fn(async ({ where }: any) => mem.deliveries.find((d) => match(d, where)) ?? null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hit = mem.deliveries.filter((d) => match(d, where));
        hit.forEach((d) => Object.assign(d, data));
        return { count: hit.length };
      }),
    },
    emailEvent: {
      create: vi.fn(async ({ data }: any) => {
        if (mem.events.some((e) => e.dedupeKey === data.dedupeKey)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        const row = { id: `ev${mem.events.length + 1}`, ...data };
        mem.events.push(row);
        return row;
      }),
    },
    emailSuppression: {
      upsert: vi.fn(async ({ create }: any) => {
        if (!mem.suppressions.some((s) => s.email === create.email)) mem.suppressions.push(create);
        return create;
      }),
    },
  },
}));

vi.mock("./delivery.server", () => ({ kickDeliveries: vi.fn() }));
vi.mock("./resend-emails.server", () => ({ syncEmailFromResend: vi.fn() }));

import { eventDedupeKey, recordEmailEvent, verifyResendSignature } from "./email-events.server";

const EMAIL_ID = "56761188-7520-42d8-8898-ff6fc54ce618";

function delivery(over: Partial<Delivery> = {}): Delivery {
  return {
    id: "del_1",
    shop: "demo.myshopify.com",
    channel: "email",
    destination: "Shopper@Example.com",
    status: "sent",
    providerId: EMAIL_ID,
    lastEvent: "sent",
    lastEventAt: new Date("2026-09-28T10:20:00Z"),
    error: null,
    deliveredAt: null,
    openedAt: null,
    clickedAt: null,
    bouncedAt: null,
    complainedAt: null,
    ...over,
  };
}

/* Payloads shaped like https://resend.com/docs/webhooks/event-types */
function event(type: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    type,
    created_at: createdAt,
    data: {
      created_at: createdAt,
      email_id: EMAIL_ID,
      from: "Store <hi@store.com>",
      to: ["shopper@example.com"],
      subject: "Your discount",
      tags: { delivery_id: "del_1" },
      ...extra,
    },
  };
}

beforeEach(() => {
  mem.deliveries = [delivery()];
  mem.events = [];
  mem.suppressions = [];
});

describe("verifyResendSignature", () => {
  const secret = "whsec_" + Buffer.from("test-secret-key-123").toString("base64");
  const sign = (id: string, ts: string, body: string) =>
    crypto.createHmac("sha256", Buffer.from("test-secret-key-123")).update(`${id}.${ts}.${body}`).digest("base64");

  it("accepts a valid signature and rejects a tampered body", () => {
    const now = 1_790_000_000;
    const body = JSON.stringify({ type: "email.sent" });
    const sig = `v1,${sign("msg_1", String(now), body)}`;
    expect(verifyResendSignature(body, { id: "msg_1", timestamp: String(now), signature: sig }, secret, now)).toBe(true);
    expect(verifyResendSignature(body + " ", { id: "msg_1", timestamp: String(now), signature: sig }, secret, now)).toBe(false);
  });

  it("rejects old timestamps, missing headers and a wrong secret", () => {
    const now = 1_790_000_000;
    const body = "{}";
    const sig = `v1,${sign("m", String(now - 600), body)}`;
    expect(verifyResendSignature(body, { id: "m", timestamp: String(now - 600), signature: sig }, secret, now)).toBe(false);
    expect(verifyResendSignature(body, { id: null, timestamp: String(now), signature: sig }, secret, now)).toBe(false);
    const good = `v1,${sign("m", String(now), body)}`;
    expect(verifyResendSignature(body, { id: "m", timestamp: String(now), signature: good }, "whsec_" + Buffer.from("other").toString("base64"), now)).toBe(false);
    // Several signatures in the header (key rotation): any match passes.
    expect(verifyResendSignature(body, { id: "m", timestamp: String(now), signature: `v1,bogus ${good}` }, secret, now)).toBe(true);
  });
});

describe("recordEmailEvent", () => {
  it("stores each event type with what it carries", async () => {
    await recordEmailEvent(event("email.delivered", "2026-09-28T10:20:05Z"), { webhookId: "a" });
    await recordEmailEvent(
      event("email.clicked", "2026-09-28T10:25:00Z", {
        click: { link: "https://store.com/sale", timestamp: "2026-09-28T10:24:58Z", ipAddress: "1.2.3.4", userAgent: "Safari" },
      }),
      { webhookId: "b" },
    );
    await recordEmailEvent(event("email.delivery_delayed", "2026-09-28T10:21:00Z"), { webhookId: "c" });

    expect(mem.events.map((e) => e.type)).toEqual(["email.delivered", "email.clicked", "email.delivery_delayed"]);
    const click = mem.events[1];
    expect(click.link).toBe("https://store.com/sale");
    expect(click.occurredAt.toISOString()).toBe("2026-09-28T10:24:58.000Z");
    // No IP address, user agent or recipient list in what is stored.
    expect(JSON.stringify(click.payload)).not.toMatch(/1\.2\.3\.4|Safari|shopper@example/);
    expect(mem.deliveries[0]).toMatchObject({ lastEvent: "clicked" });
    expect(mem.deliveries[0].deliveredAt?.toISOString()).toBe("2026-09-28T10:20:05.000Z");
  });

  it("is idempotent: the same webhook twice is stored once", async () => {
    const e = event("email.opened", "2026-09-28T10:22:00Z");
    expect(await recordEmailEvent(e, { webhookId: "msg_same" })).toBe("ok");
    expect(await recordEmailEvent(e, { webhookId: "msg_same" })).toBe("duplicate");
    expect(mem.events).toHaveLength(1);
  });

  it("dedupes events without a svix-id by their content", async () => {
    const e = event("email.opened", "2026-09-28T10:22:00Z");
    expect(eventDedupeKey(e)).toBe(eventDedupeKey(JSON.parse(JSON.stringify(e))));
    await recordEmailEvent(e);
    expect(await recordEmailEvent(e)).toBe("duplicate");
    // A second, real open at another time is a separate event.
    expect(await recordEmailEvent(event("email.opened", "2026-09-28T11:00:00Z"))).toBe("ok");
    expect(mem.events).toHaveLength(2);
  });

  it("keeps the most advanced status when events arrive out of order", async () => {
    await recordEmailEvent(event("email.clicked", "2026-09-28T10:25:00Z", { click: { link: "https://x.com" } }), { webhookId: "1" });
    await recordEmailEvent(event("email.delivered", "2026-09-28T10:20:05Z"), { webhookId: "2" });
    await recordEmailEvent(event("email.opened", "2026-09-28T10:24:00Z"), { webhookId: "3" });
    expect(mem.deliveries[0].lastEvent).toBe("clicked");
    expect(mem.deliveries[0].deliveredAt?.toISOString()).toBe("2026-09-28T10:20:05.000Z");
    expect(mem.events).toHaveLength(3);
  });

  it("records bounce and failure reasons and suppresses hard bounces", async () => {
    await recordEmailEvent(
      event("email.bounced", "2026-09-28T10:21:00Z", { bounce: { type: "Permanent", subType: "Suppressed", message: "Mailbox does not exist" } }),
      { webhookId: "b1" },
    );
    expect(mem.events[0]).toMatchObject({ bounceType: "Permanent", bounceSubType: "Suppressed", reason: "Mailbox does not exist" });
    expect(mem.deliveries[0].lastEvent).toBe("bounced");
    expect(mem.suppressions[0]).toMatchObject({ email: "shopper@example.com", reason: "bounced" });

    mem.deliveries = [delivery({ id: "del_2", providerId: "e2" })];
    await recordEmailEvent({ ...event("email.failed", "2026-09-28T10:21:00Z", { failed: { reason: "reached_daily_quota" } }), data: { ...event("email.failed", "x").data, email_id: "e2", failed: { reason: "reached_daily_quota" } } }, { webhookId: "f1" });
    expect(mem.events[1]).toMatchObject({ type: "email.failed", reason: "reached_daily_quota" });
    expect(mem.deliveries[0]).toMatchObject({ status: "failed", lastEvent: "failed" });
  });

  it("does not suppress a transient bounce", async () => {
    await recordEmailEvent(event("email.bounced", "2026-09-28T10:21:00Z", { bounce: { type: "Transient", message: "Mailbox full" } }), { webhookId: "t" });
    expect(mem.suppressions).toHaveLength(0);
  });

  it("matches by the delivery_id tag when the webhook beats the saved id", async () => {
    mem.deliveries = [delivery({ providerId: null })];
    expect(await recordEmailEvent(event("email.sent", "2026-09-28T10:20:01Z"), { webhookId: "s" })).toBe("ok");
    expect(mem.deliveries[0].providerId).toBe(EMAIL_ID);
    expect(mem.events[0].deliveryId).toBe("del_1");
  });

  it("stores unknown future types without changing the status", async () => {
    expect(await recordEmailEvent(event("email.something_new", "2026-09-28T10:30:00Z"), { webhookId: "n" })).toBe("ok");
    expect(mem.events[0].type).toBe("email.something_new");
    expect(mem.deliveries[0].lastEvent).toBe("sent");
  });

  it("ignores non-email and inbound events, and reports unknown emails", async () => {
    expect(await recordEmailEvent({ type: "domain.updated", data: {} } as never)).toBe("ignored");
    expect(await recordEmailEvent(event("email.received", "2026-09-28T10:30:00Z"))).toBe("ignored");
    expect(await recordEmailEvent({ type: "email.sent", data: { email_id: "someone-else", tags: {} } })).toBe("not_found");
    expect(mem.events).toHaveLength(0);
  });

  it("stores scheduled and suppressed events", async () => {
    await recordEmailEvent(event("email.scheduled", "2026-09-28T10:00:00Z"), { webhookId: "sc" });
    await recordEmailEvent(event("email.suppressed", "2026-09-28T10:01:00Z"), { webhookId: "su" });
    expect(mem.events.map((e) => e.type)).toEqual(["email.scheduled", "email.suppressed"]);
    expect(mem.deliveries[0].lastEvent).toBe("suppressed");
  });
});

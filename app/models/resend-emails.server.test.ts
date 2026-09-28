import { beforeEach, describe, expect, it, vi } from "vitest";

const updates = vi.hoisted(() => [] as any[]);
vi.mock("../db.server", () => ({
  default: { discountDelivery: { updateMany: vi.fn(async (args: any) => (updates.push(args), { count: 1 })) } },
}));

import { SYNC_EVERY_MS, syncEmailFromResend } from "./resend-emails.server";

const row = {
  id: "del_1",
  provider: "resend",
  providerId: "e1",
  providerSyncedAt: null as Date | null,
  fromAddress: null as string | null,
  subject: null as string | null,
  lastEvent: "sent" as string | null,
};

beforeEach(() => {
  updates.length = 0;
  vi.stubEnv("RESEND_DOMAINS_API_KEY", "re_full");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("syncEmailFromResend", () => {
  it("backfills From and moves the status forward", async () => {
    respond(200, { object: "email", id: "e1", from: "Store <hi@store.com>", subject: "Your discount", to: ["a@b.com"], created_at: "x", last_event: "delivered" });
    const result = await syncEmailFromResend(row);
    expect(result).toEqual({ apiLastEvent: "delivered", error: null, synced: true });
    expect(updates[0].data).toMatchObject({ fromAddress: "Store <hi@store.com>", subject: "Your discount", lastEvent: "delivered" });
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails/e1");
    expect(init.headers.Authorization).toBe("Bearer re_full");
  });

  it("never moves the status backwards", async () => {
    respond(200, { object: "email", id: "e1", from: "x", subject: "s", to: [], created_at: "x", last_event: "delivered" });
    await syncEmailFromResend({ ...row, lastEvent: "clicked", fromAddress: "set", subject: "set" });
    expect(updates[0].data.lastEvent).toBeUndefined();
    expect(updates[0].data.fromAddress).toBeUndefined();
  });

  it("is throttled to once a minute unless forced", async () => {
    respond(200, { object: "email", id: "e1", from: "x", subject: "s", to: [], created_at: "x", last_event: "sent" });
    const now = new Date("2026-09-28T10:00:30Z");
    const recent = { ...row, providerSyncedAt: new Date(now.getTime() - SYNC_EVERY_MS / 2) };
    expect((await syncEmailFromResend(recent, { now })).synced).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect((await syncEmailFromResend(recent, { now, force: true })).synced).toBe(true);
  });

  it("skips emails not sent through Resend", async () => {
    respond(200, {});
    expect((await syncEmailFromResend({ ...row, provider: "brevo" })).synced).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("turns Resend errors into a friendly message", async () => {
    respond(401, { name: "restricted_api_key", message: "This API key is restricted to only send emails." });
    const result = await syncEmailFromResend(row);
    expect(result.error).toMatch(/Full access key/);
    expect(updates[0].data).toHaveProperty("providerSyncedAt");
    respond(404, { name: "not_found", message: "Email not found" });
    expect((await syncEmailFromResend(row)).error).toMatch(/no record of this email/);
  });
});

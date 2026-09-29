import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ track: [] as any[] }));

vi.mock("../db.server", () => ({ default: { session: { findFirst: vi.fn(async ({ where }: any) => (where.shop === "demo.myshopify.com" ? { id: "s" } : null)) } } }));
vi.mock("./visitors.server", () => ({
  trackVisitor: vi.fn(async (...args: any[]) => (calls.track.push(args), { visitorId: "v", stored: args[2].events.length })),
}));

import { resetRateLimits, TRACK_LIMITS } from "./rate-limit.server";
import { handleTrack, isInstalledShop, proxyRequestInfo, readJsonBody, requestInfo } from "./track-endpoint.server";

const AID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://app.test/api/track", { method: "POST", body, headers: { "content-type": "text/plain", ...headers } });

beforeEach(() => {
  resetRateLimits();
  calls.track = [];
});

describe("track endpoint", () => {
  it("reads text/plain JSON and rejects bad or huge bodies", async () => {
    expect(await readJsonBody(req('{"a":1}'))).toEqual({ ok: true, body: { a: 1 } });
    expect(await readJsonBody(req("{nope"))).toMatchObject({ ok: false, status: 400 });
    expect(await readJsonBody(req("x".repeat(20_000)))).toMatchObject({ ok: false, status: 413 });
  });

  it("only accepts installed shops", async () => {
    expect(await isInstalledShop("demo.myshopify.com")).toBe(true);
    expect(await isInstalledShop("nobody.myshopify.com")).toBe(false);
    expect(await isInstalledShop("")).toBe(false);
  });

  it("validates, then stores with the request's browser and country", async () => {
    const body = { anonymousId: AID, events: [{ eventId: "7c9e6679-7425-40de-944b-e07fc1f90ae7", type: "page_view" }] };
    const r = await handleTrack(req("", { "user-agent": "Firefox/130", "cf-ipcountry": "DE" }), "demo.myshopify.com", "external", body);
    expect(r).toMatchObject({ status: 202, body: { ok: true, stored: 1 } });
    expect(calls.track[0][3]).toEqual({ userAgent: "Firefox/130", country: "DE" });
    expect((await handleTrack(req(""), "demo.myshopify.com", "external", { anonymousId: "x" })).status).toBe(400);
  });

  it("rate limits one visitor", async () => {
    const body = { anonymousId: AID, events: [] };
    let last;
    for (let i = 0; i <= TRACK_LIMITS.perVisitor.limit; i++) {
      last = await handleTrack(req("", { "x-forwarded-for": `10.0.0.${i % 250}` }), "demo.myshopify.com", "external", body);
    }
    expect(last).toMatchObject({ status: 429 });
    expect(last?.headers?.["Retry-After"]).toBeTruthy();
  });

  it("reads the logged-in customer only from the signed proxy query, never on /api/track", async () => {
    const proxied = new Request("https://app.test/popups/track?shop=demo.myshopify.com&logged_in_customer_id=7012345&signature=x", { method: "POST", body: "{}" });
    expect(proxyRequestInfo(proxied).shopifyCustomerId).toBe("7012345");
    const guest = new Request("https://app.test/popups/track?shop=demo.myshopify.com&logged_in_customer_id=&signature=x", { method: "POST", body: "{}" });
    expect(proxyRequestInfo(guest).shopifyCustomerId).toBeNull();
    expect(requestInfo(proxied).shopifyCustomerId).toBeUndefined();

    const body = { anonymousId: AID, events: [] };
    await handleTrack(proxied, "demo.myshopify.com", "shopify", body, proxyRequestInfo(proxied));
    expect(calls.track[0][3]).toMatchObject({ shopifyCustomerId: "7012345" });
  });
});

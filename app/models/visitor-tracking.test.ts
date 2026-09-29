import { describe, expect, it } from "vitest";

import {
  MAX_EVENTS_PER_REQUEST,
  clampTime,
  countryFromHeaders,
  isAnonymousId,
  normalizeEmail,
  normalizePhone,
  parseUserAgent,
  utmFromUrl,
  validateTrackPayload,
} from "./visitor-tracking";

const AID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const EID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("validateTrackPayload", () => {
  it("accepts a normal batch and extracts UTM from the page", () => {
    const now = new Date("2026-09-30T10:00:00Z");
    const r = validateTrackPayload(
      {
        anonymousId: AID.toUpperCase(),
        context: { pageUrl: "https://shop.com/sale?utm_source=ig&utm_medium=social&utm_campaign=fall", referrer: "https://instagram.com/", device: "mobile" },
        events: [{ eventId: EID, type: "page_view", campaignId: "cmp_1", pageUrl: "https://shop.com/sale", occurredAt: "2026-09-30T09:59:58Z" }],
      },
      now,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.anonymousId).toBe(AID);
    expect(r.value.context.utm).toMatchObject({ utmSource: "ig", utmMedium: "social", utmCampaign: "fall" });
    expect(r.value.context.device).toBe("mobile");
    expect(r.value.events[0]).toMatchObject({ type: "page_view", campaignId: "cmp_1" });
    expect(r.value.events[0].occurredAt.toISOString()).toBe("2026-09-30T09:59:58.000Z");
  });

  it("rejects a missing or malformed anonymous id", () => {
    expect(validateTrackPayload({ anonymousId: "abc" }).ok).toBe(false);
    expect(validateTrackPayload({}).ok).toBe(false);
    expect(validateTrackPayload(null).ok).toBe(false);
  });

  it("rejects too many events, drops unknown types and server-only types", () => {
    const many = Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, () => ({ eventId: EID, type: "page_view" }));
    expect(validateTrackPayload({ anonymousId: AID, events: many }).ok).toBe(false);

    const r = validateTrackPayload({
      anonymousId: AID,
      events: [
        { eventId: EID, type: "hacked" },
        { eventId: EID, type: "popup_submitted" },
        { eventId: "not-a-uuid", type: "page_view" },
        { eventId: EID, type: "popup_shown", campaignId: "bad id!" },
      ],
    });
    expect(r.ok && r.value.events.map((e) => [e.type, e.campaignId])).toEqual([["popup_shown", null]]);
  });

  it("ignores non-http URLs and unknown devices", () => {
    const r = validateTrackPayload({ anonymousId: AID, context: { pageUrl: "javascript:alert(1)", referrer: "ftp://x", device: "fridge" } });
    expect(r.ok && r.value.context).toMatchObject({ pageUrl: null, referrer: null, device: null });
  });
});

describe("helpers", () => {
  it("clamps browser timestamps", () => {
    const now = new Date("2026-09-30T10:00:00Z");
    expect(clampTime("2020-01-01T00:00:00Z", now)).toEqual(now);
    expect(clampTime("2027-01-01T00:00:00Z", now)).toEqual(now);
    expect(clampTime("nonsense", now)).toEqual(now);
    expect(clampTime("2026-09-30T09:00:00Z", now).toISOString()).toBe("2026-09-30T09:00:00.000Z");
  });

  it("recognises ids", () => {
    expect(isAnonymousId(AID)).toBe(true);
    expect(isAnonymousId("")).toBe(false);
    expect(isAnonymousId(42)).toBe(false);
  });

  it("parses common user agents", () => {
    expect(parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toEqual({ browser: "Safari", os: "iOS" });
    expect(parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0")).toEqual({ browser: "Edge", os: "Windows" });
    expect(parseUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36")).toEqual({ browser: "Chrome", os: "Android" });
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null });
  });

  it("reads a platform country header only when present", () => {
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "in" }))).toBe("IN");
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(countryFromHeaders(new Headers())).toBeNull();
  });

  it("normalises email and phone", () => {
    expect(normalizeEmail("  Jane@Store.COM ")).toBe("jane@store.com");
    expect(normalizeEmail("not an email")).toBeNull();
    expect(normalizePhone("+1 (555) 010-2030")).toBe("+15550102030");
    expect(normalizePhone("12")).toBeNull();
  });

  it("returns empty UTM for a bad URL", () => {
    expect(utmFromUrl("::")).toMatchObject({ utmSource: null });
  });
});

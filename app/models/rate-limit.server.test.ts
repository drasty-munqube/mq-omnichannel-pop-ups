import { beforeEach, describe, expect, it } from "vitest";

import { rateLimit, resetRateLimits } from "./rate-limit.server";

beforeEach(() => resetRateLimits());

describe("rateLimit", () => {
  it("allows up to the limit in a window, then blocks until it resets", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000, t).ok).toBe(true);
    const blocked = rateLimit("k", 3, 60_000, t + 1000);
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 59 });
    expect(rateLimit("k", 3, 60_000, t + 60_000).ok).toBe(true);
  });

  it("keeps keys apart", () => {
    expect(rateLimit("a", 1, 60_000, 0).ok).toBe(true);
    expect(rateLimit("b", 1, 60_000, 0).ok).toBe(true);
    expect(rateLimit("a", 1, 60_000, 1).ok).toBe(false);
  });
});

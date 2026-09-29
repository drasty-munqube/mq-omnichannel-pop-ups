/* ============================================================
   RATE LIMIT (server only)

   A small fixed-window counter kept in memory, for the public
   tracking endpoints. Good for one app instance, which is how the
   app runs on Render today. If it ever runs on several instances,
   swap the Map for a shared store (for example Redis) behind the
   same function.
   ============================================================ */

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();
let lastSweep = 0;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  /* Drop expired windows now and then so the Map cannot grow
     without bound. */
  if (now - lastSweep > windowMs) {
    for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
    lastSweep = now;
  }

  const w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (w.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  w.count += 1;
  return { ok: true };
}

/* For tests. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = 0;
}

/* Limits for the tracking endpoints: per visitor, per client
   address, and a ceiling per shop. */
export const TRACK_LIMITS = {
  perVisitor: { limit: 60, windowMs: 60_000 },
  perIp: { limit: 120, windowMs: 60_000 },
  perShop: { limit: 5_000, windowMs: 60_000 },
};

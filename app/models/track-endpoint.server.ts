/* ============================================================
   TRACK ENDPOINT (server only)

   Shared by the two public tracking routes:
     POST /api/track                 any website (api.track.tsx)
     POST /apps/<proxy>/popups/track  Shopify storefront, signed by
                                      Shopify (popups_.track.tsx)

   Reads the body as text (the widget sends it as text/plain so a
   cross-site beacon needs no CORS preflight), checks size, shape
   and rate limits, then stores it. Answers 202 quickly; the
   widget never waits for it.
   ============================================================ */

import db from "../db.server";
import { rateLimit, TRACK_LIMITS } from "./rate-limit.server";
import {
  MAX_BODY_BYTES,
  cleanCustomerId,
  clientIp,
  countryFromHeaders,
  validateTrackPayload,
} from "./visitor-tracking";
import { trackVisitor, type RequestInfo, type TrackSource } from "./visitors.server";

export function requestInfo(request: Request): RequestInfo {
  return {
    userAgent: request.headers.get("user-agent"),
    country: countryFromHeaders(request.headers),
  };
}

/* For App Proxy routes only, and only after
   authenticate.public.appProxy has checked the signature. Shopify
   adds logged_in_customer_id to the signed query string when the
   shopper is logged in to the store, so it cannot be forged. It is
   never read from the body. */
export function proxyRequestInfo(request: Request): RequestInfo {
  const id = new URL(request.url).searchParams.get("logged_in_customer_id");
  return { ...requestInfo(request), shopifyCustomerId: cleanCustomerId(id) };
}

/* Installed shops, remembered for a few minutes so a busy page
   does not cost a Session lookup per event. */
const installed = new Map<string, number>();
const INSTALLED_TTL_MS = 5 * 60_000;

export async function isInstalledShop(shop: string) {
  if (!shop || shop.length > 255) return false;
  const until = installed.get(shop);
  if (until && until > Date.now()) return true;
  const session = await db.session.findFirst({ where: { shop }, select: { id: true } });
  if (session) installed.set(shop, Date.now() + INSTALLED_TTL_MS);
  return Boolean(session);
}

export async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; status: number; error: string }> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return { ok: false, status: 413, error: "Payload too large." };
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, error: "Invalid payload." };
  }
  if (text.length > MAX_BODY_BYTES) return { ok: false, status: 413, error: "Payload too large." };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON." };
  }
}

export type TrackOutcome = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

export async function handleTrack(
  request: Request,
  shop: string,
  source: TrackSource,
  body: unknown,
  info: RequestInfo = requestInfo(request),
): Promise<TrackOutcome> {
  const parsed = validateTrackPayload(body);
  if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error } };

  const checks = [
    rateLimit(`v:${shop}:${parsed.value.anonymousId}`, TRACK_LIMITS.perVisitor.limit, TRACK_LIMITS.perVisitor.windowMs),
    /* Storefront requests all come through Shopify's proxy, so
       their address says nothing about the visitor. */
    ...(source === "external"
      ? [rateLimit(`ip:${clientIp(request.headers)}`, TRACK_LIMITS.perIp.limit, TRACK_LIMITS.perIp.windowMs)]
      : []),
    rateLimit(`s:${shop}`, TRACK_LIMITS.perShop.limit, TRACK_LIMITS.perShop.windowMs),
  ];
  const blocked = checks.find((c) => !c.ok);
  if (blocked && !blocked.ok) {
    return {
      status: 429,
      body: { ok: false, error: "Too many requests." },
      headers: { "Retry-After": String(blocked.retryAfterSeconds) },
    };
  }

  try {
    const result = await trackVisitor(shop, source, parsed.value, info);
    return { status: 202, body: { ok: true, stored: result.stored } };
  } catch (error) {
    console.error("TRACK ERROR:", error);
    return { status: 500, body: { ok: false, error: "Could not record events." } };
  }
}

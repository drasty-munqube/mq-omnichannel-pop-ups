/* ============================================================
   VISITOR TRACKING (shared, no imports)

   Types for the public tracking payloads and the pure helpers the
   server uses on them: validation, user agent parsing, UTM
   extraction, email and phone normalising. Kept free of database
   code so every rule can be unit tested on its own.
   ============================================================ */

/* ------------------------------------------------------------
   PAYLOADS
------------------------------------------------------------ */

/* Events the browser may send. popup_submitted and identified are
   written by the server itself, at the moment it saves the
   contact, so a browser cannot fake a signup. */
export const CLIENT_EVENT_TYPES = ["page_view", "popup_shown", "popup_closed", "popup_clicked"] as const;
export const SERVER_EVENT_TYPES = ["popup_submitted", "identified"] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];
export type VisitorEventType = ClientEventType | (typeof SERVER_EVENT_TYPES)[number];

export type TrackContext = {
  pageUrl?: string;
  referrer?: string;
  device?: string;
};

export type TrackEventInput = {
  eventId?: string;
  type?: string;
  campaignId?: string;
  popupId?: string;
  pageUrl?: string;
  occurredAt?: string;
  /* popup_clicked only: the text of the button or link. */
  label?: string;
};

/* POST /api/track and /apps/<proxy>/popups/track */
export type TrackPayload = {
  shop?: string;
  anonymousId?: string;
  context?: TrackContext;
  events?: TrackEventInput[];
};

export type CleanEvent = {
  eventId: string;
  type: ClientEventType;
  campaignId: string | null;
  popupId: string | null;
  pageUrl: string | null;
  occurredAt: Date;
  label: string | null;
};

export type CleanTrack = {
  anonymousId: string;
  context: {
    pageUrl: string | null;
    referrer: string | null;
    device: string | null;
    utm: Utm;
  };
  events: CleanEvent[];
};

export type Utm = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
};

/* ------------------------------------------------------------
   LIMITS
------------------------------------------------------------ */

export const MAX_EVENTS_PER_REQUEST = 20;
export const MAX_URL = 2048;
export const MAX_ID = 64;
export const MAX_BODY_BYTES = 16_000;
export const MAX_LABEL = 80;
/* Browser clocks drift; events claiming to be from far in the past
   or the future are pulled back to "now". */
const PAST_MS = 24 * 60 * 60 * 1000;
const FUTURE_MS = 5 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEVICES = ["desktop", "tablet", "mobile"];

export function isAnonymousId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const v = value.slice(0, MAX_URL);
  return /^https?:\/\//i.test(v) ? v : null;
}

function cleanId(value: unknown): string | null {
  return typeof value === "string" && ID_RE.test(value) ? value : null;
}

function cleanText(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, max);
  return v || null;
}

export function clampTime(value: unknown, now = new Date()): Date {
  const d = typeof value === "string" ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return now;
  const t = d.getTime();
  if (t < now.getTime() - PAST_MS || t > now.getTime() + FUTURE_MS) return now;
  return d;
}

export function utmFromUrl(url: string | null): Utm {
  const empty: Utm = { utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null };
  if (!url) return empty;
  try {
    const p = new URL(url).searchParams;
    return {
      utmSource: cleanText(p.get("utm_source")),
      utmMedium: cleanText(p.get("utm_medium")),
      utmCampaign: cleanText(p.get("utm_campaign")),
      utmTerm: cleanText(p.get("utm_term")),
      utmContent: cleanText(p.get("utm_content")),
    };
  } catch {
    return empty;
  }
}

/* ------------------------------------------------------------
   VALIDATION
------------------------------------------------------------ */

export type ValidationResult = { ok: true; value: CleanTrack } | { ok: false; error: string };

export function validateTrackPayload(body: unknown, now = new Date()): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid payload." };
  const b = body as TrackPayload;

  if (!isAnonymousId(b.anonymousId)) return { ok: false, error: "Invalid anonymousId." };

  const rawEvents = Array.isArray(b.events) ? b.events : [];
  if (rawEvents.length > MAX_EVENTS_PER_REQUEST) return { ok: false, error: "Too many events." };

  const events: CleanEvent[] = [];
  for (const e of rawEvents) {
    if (!e || typeof e !== "object") continue;
    const type = String(e.type || "");
    if (!(CLIENT_EVENT_TYPES as readonly string[]).includes(type)) continue;
    if (!isAnonymousId(e.eventId)) continue;
    events.push({
      eventId: e.eventId,
      type: type as ClientEventType,
      campaignId: cleanId(e.campaignId),
      popupId: cleanId(e.popupId),
      pageUrl: cleanUrl(e.pageUrl),
      occurredAt: clampTime(e.occurredAt, now),
      /* Plain text, one line, short. It is only ever shown as text. */
      label: type === "popup_clicked" ? cleanText(typeof e.label === "string" ? e.label.replace(/\s+/g, " ") : null, MAX_LABEL) : null,
    });
  }

  const ctx = b.context && typeof b.context === "object" ? b.context : {};
  const pageUrl = cleanUrl(ctx.pageUrl);
  const device = typeof ctx.device === "string" && DEVICES.includes(ctx.device) ? ctx.device : null;

  return {
    ok: true,
    value: {
      anonymousId: b.anonymousId.toLowerCase(),
      context: { pageUrl, referrer: cleanUrl(ctx.referrer), device, utm: utmFromUrl(pageUrl) },
      events,
    },
  };
}

/* ------------------------------------------------------------
   REQUEST DETAILS
------------------------------------------------------------ */

/* Just enough to tell browsers and systems apart in the journey.
   Order matters: Edge and Opera also say "Chrome", Chrome also
   says "Safari". */
export function parseUserAgent(ua: string | null | undefined): { browser: string | null; os: string | null } {
  const s = ua || "";
  if (!s) return { browser: null, os: null };

  let browser: string | null = null;
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/SamsungBrowser\//.test(s)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS\//.test(s)) browser = "Firefox";
  else if (/Chrome\/|CriOS\//.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s)) browser = "Safari";

  let os: string | null = null;
  if (/Windows NT/.test(s)) os = "Windows";
  else if (/iPhone|iPad|iPod/.test(s)) os = "iOS";
  else if (/Android/.test(s)) os = "Android";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Linux/.test(s)) os = "Linux";

  return { browser, os };
}

/* Only when the hosting platform (Cloudflare, Vercel, App Engine
   and similar) already adds it. There is no IP lookup here. */
export function countryFromHeaders(headers: Headers): string | null {
  for (const name of ["cf-ipcountry", "x-vercel-ip-country", "x-country-code", "x-appengine-country"]) {
    const v = (headers.get(name) || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1") return v;
  }
  return null;
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "unknown";
}

/* ------------------------------------------------------------
   IDENTITY
------------------------------------------------------------ */

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254 ? v : null;
}

/* Digits only, keeping a leading +, so "+1 (555) 010-2030" and
   "+15550102030" are the same person. */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const plus = value.trim().startsWith("+");
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return null;
  return (plus ? "+" : "") + digits;
}

/* A Shopify customer id: digits only. Anything else (an empty
   value when nobody is logged in, or junk) is treated as none. */
export function cleanCustomerId(value: unknown): string | null {
  return typeof value === "string" && /^\d{1,20}$/.test(value) ? value : null;
}

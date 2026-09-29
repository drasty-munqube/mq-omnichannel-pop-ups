/* ============================================================
   VISITORS LIST (shared, browser-safe)

   Filters, page size and small helpers for the Visitors page:
   everyone who came to the store while the app was on, whether or
   not they ever signed up.
   ============================================================ */

export const VISITOR_PAGE_SIZE = 25;

export const VISITOR_FILTERS = [
  { key: "all", label: "All" },
  { key: "anonymous", label: "Anonymous" },
  { key: "identified", label: "Signed up" },
  { key: "logged_in", label: "Logged in" },
] as const;

export type VisitorFilterKey = (typeof VISITOR_FILTERS)[number]["key"];

export function isVisitorFilter(value: unknown): value is VisitorFilterKey {
  return VISITOR_FILTERS.some((f) => f.key === value);
}

export const visitorPath = (id: string) => `/app/visitors/${encodeURIComponent(id)}`;

export const shortId = (anonymousId: string) => anonymousId.slice(0, 8);

/* "iPhone · Safari · IN", skipping what is unknown. */
export function deviceLine(v: { device: string | null; browser: string | null; os: string | null; country: string | null }) {
  const device = v.device ? v.device[0].toUpperCase() + v.device.slice(1) : null;
  return [device, v.browser, v.os, v.country].filter(Boolean).join(" · ");
}

/* Where they came from: UTM source first, then the referrer's
   host, otherwise a direct visit. */
export function arrivedFrom(v: { utmSource: string | null; utmMedium?: string | null; referrer: string | null }) {
  if (v.utmSource) return [v.utmSource, v.utmMedium].filter(Boolean).join(" / ");
  if (v.referrer) {
    try {
      return new URL(v.referrer).hostname.replace(/^www\./, "");
    } catch {
      return v.referrer;
    }
  }
  return "Direct";
}

/* A page URL without the scheme and host, for narrow columns. */
export function pathOf(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return (u.pathname + u.search) || "/";
  } catch {
    return url;
  }
}

export type VisitorCounts = {
  pageViews: number;
  popupsShown: number;
  clicks: number;
  closes: number;
  signups: number;
};

export const emptyVisitorCounts = (): VisitorCounts => ({ pageViews: 0, popupsShown: 0, clicks: 0, closes: 0, signups: 0 });

const COUNT_KEY: Record<string, keyof VisitorCounts> = {
  page_view: "pageViews",
  popup_shown: "popupsShown",
  popup_clicked: "clicks",
  popup_closed: "closes",
  popup_submitted: "signups",
};

export function addVisitorCount(counts: VisitorCounts, type: string, n: number) {
  const key = COUNT_KEY[type];
  if (key) counts[key] += n;
}

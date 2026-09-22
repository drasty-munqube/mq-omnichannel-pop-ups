/* ============================================================
   ANALYTICS — SHARED

   Pure arithmetic, no database. It lives outside the .server
   file because the Analytics screen formats these numbers in
   the browser too, and React Router only strips a .server
   import out of a route's loader and action — a component that
   touches one fails the build.

   Days are UTC days. The alternative is asking Shopify for the
   shop's timezone on every load and shifting every bucket by
   it, which is a real improvement but a different change; what
   matters here is that every number on the screen is bucketed
   the same way as every other.
   ============================================================ */


export type EventCount = {
  view: number;
  submit: number;
  dismiss: number;
};

export function emptyCounts(): EventCount {
  return { view: 0, submit: 0, dismiss: 0 };
}

export function addCount(
  counts: EventCount,
  type: string,
  amount: number,
) {
  if (
    type === "view" ||
    type === "submit" ||
    type === "dismiss"
  ) {
    counts[type] += amount;
  }

  return counts;
}

/* ------------------------------------------------------------
   Conversion rate

   Null rather than zero when nothing was seen. "0%" reads as
   "this campaign is failing"; the truth is that nobody has
   looked at it yet, and those are different problems with
   different fixes.

   Not clamped to 100. A submission whose view never reached
   the server (a blocked beacon, a visitor who submitted on a
   second page load) can push it above, and a rate over 100 is
   a useful sign that something is dropping events — hiding it
   behind a clamp would only make that invisible.
   ------------------------------------------------------------ */

export function conversionRate(
  views: number,
  submits: number,
): number | null {
  if (!views) {
    return null;
  }

  return (submits / views) * 100;
}

export function formatRate(
  rate: number | null,
): string {
  if (rate === null) {
    return "—";
  }

  return `${rate.toFixed(1)}%`;
}

/* ------------------------------------------------------------
   Daily series

   Every day in the window appears, including the ones with no
   events at all. A chart that silently skips empty days
   compresses a quiet week into a single point and makes a flat
   period look like a busy one.
   ------------------------------------------------------------ */

export function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcDay(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export type DailyPoint = {
  day: string;
  views: number;
  submits: number;
};

export function buildDailySeries(
  rows: {
    day: string;
    type: string;
    count: number;
  }[],
  days: number,
  today: Date,
): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>();

  for (const row of rows) {
    const point = byDay.get(row.day) || {
      day: row.day,
      views: 0,
      submits: 0,
    };

    if (row.type === "view") {
      point.views += row.count;
    }

    if (row.type === "submit") {
      point.submits += row.count;
    }

    byDay.set(row.day, point);
  }

  const series: DailyPoint[] = [];
  const end = startOfUtcDay(today);

  for (let back = days - 1; back >= 0; back -= 1) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - back);

    const key = dayKey(date);

    series.push(
      byDay.get(key) || {
        day: key,
        views: 0,
        submits: 0,
      },
    );
  }

  return series;
}

/* ------------------------------------------------------------
   Rows

   Grouped counts joined to the names a merchant recognises.
   A campaign with events but no row left in the database still
   appears, named by what is known, because deleting a campaign
   should not silently change last month's totals.
   ------------------------------------------------------------ */

export type BreakdownRow = {
  id: string;
  name: string;
  secondary: string;
  views: number;
  submits: number;
  dismisses: number;
  rate: number | null;
};

export function buildBreakdown(
  grouped: {
    id: string | null;
    type: string;
    count: number;
  }[],
  names: Map<
    string,
    { name: string; secondary: string }
  >,
  fallback: string,
): BreakdownRow[] {
  const byId = new Map<string, EventCount>();

  for (const row of grouped) {
    if (!row.id) {
      continue;
    }

    const counts =
      byId.get(row.id) || emptyCounts();

    addCount(counts, row.type, row.count);
    byId.set(row.id, counts);
  }

  const rows: BreakdownRow[] = [];

  byId.forEach((counts, id) => {
    const known = names.get(id);

    rows.push({
      id,
      name: known ? known.name : fallback,
      secondary: known ? known.secondary : "",
      views: counts.view,
      submits: counts.submit,
      dismisses: counts.dismiss,
      rate: conversionRate(
        counts.view,
        counts.submit,
      ),
    });
  });

  /* Most submissions first: the question a merchant opens this
     screen with is "which one is bringing me leads", not
     "which one is busiest". Views break the tie so a campaign
     with reach but no conversions still surfaces. */

  rows.sort(
    (a, b) =>
      b.submits - a.submits ||
      b.views - a.views ||
      a.name.localeCompare(b.name),
  );

  return rows;
}

/* ------------------------------------------------------------
   The window a merchant can ask for. Anything else falls back
   to 30 rather than being trusted, since it arrives in a query
   string.
   ------------------------------------------------------------ */

export const RANGES = [7, 30, 90];

export function normalizeDays(
  raw: string | null,
): number {
  const days = Number(raw);
  return RANGES.includes(days) ? days : 30;
}

/* ============================================================
   CAMPAIGN FUNNELS (shared, browser-safe)

   The two funnels on Home, for one campaign or all of them:

   Visitor funnel   Viewed popup → Submitted email → Submitted
                    phone → Made order. Email and phone are side by
                    side, not one after the other, so every step is
                    compared with "Viewed popup".
   Popup steps      Step 1 teaser shown → Step 2 offer opened →
                    Step 3 form submitted. Each step is compared with
                    the one before it.

   "Made order" has no data source yet (the app has no orders
   permission), so it is shown as not tracked rather than as zero.
   ============================================================ */

export type FunnelCounts = {
  views: number;
  opens: number;
  submits: number;
  dismisses: number;
  withEmail: number;
  withPhone: number;
  /* Submits from before email / phone were recorded on them. */
  unflaggedSubmits: number;
};

export const emptyFunnelCounts = (): FunnelCounts => ({
  views: 0,
  opens: 0,
  submits: 0,
  dismisses: 0,
  withEmail: 0,
  withPhone: 0,
  unflaggedSubmits: 0,
});

/* One row of groupBy(["type", "hasEmail", "hasPhone"]). */
export function addFunnelRow(
  counts: FunnelCounts,
  row: { type: string; hasEmail: boolean | null; hasPhone: boolean | null; count: number },
) {
  if (row.type === "view") counts.views += row.count;
  if (row.type === "open") counts.opens += row.count;
  if (row.type === "dismiss") counts.dismisses += row.count;
  if (row.type === "submit") {
    counts.submits += row.count;
    if (row.hasEmail === null && row.hasPhone === null) counts.unflaggedSubmits += row.count;
    if (row.hasEmail) counts.withEmail += row.count;
    if (row.hasPhone) counts.withPhone += row.count;
  }
  return counts;
}

export type FunnelStep = {
  key: string;
  label: string;
  /* Null when this step is not tracked. */
  value: number | null;
  /* Share of the first step, and of the step before, in percent.
     Null when there is nothing to compare with. */
  ofFirst: number | null;
  ofPrevious: number | null;
  note?: string;
};

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

export function buildFunnel(steps: { key: string; label: string; value: number | null; note?: string }[]): FunnelStep[] {
  const first = steps[0]?.value ?? 0;
  let previous: number | null = null;
  return steps.map((s) => {
    const step: FunnelStep = {
      ...s,
      ofFirst: s.value === null ? null : pct(s.value, first),
      ofPrevious: s.value === null || previous === null ? null : pct(s.value, previous),
    };
    if (s.value !== null) previous = s.value;
    return step;
  });
}

export function visitorFunnel(c: FunnelCounts) {
  return buildFunnel([
    { key: "viewed", label: "Viewed popup", value: c.views },
    { key: "email", label: "Submitted email", value: c.withEmail },
    { key: "phone", label: "Submitted phone", value: c.withPhone },
    { key: "order", label: "Made order", value: null, note: "Needs order tracking" },
  ]);
}

export function popupStepFunnel(c: FunnelCounts) {
  return buildFunnel([
    { key: "teaser", label: "Step 1 · Teaser shown", value: c.views },
    { key: "offer", label: "Step 2 · Offer opened", value: c.opens },
    { key: "submitted", label: "Step 3 · Form submitted", value: c.submits },
  ]);
}

export function formatPct(value: number | null) {
  if (value === null) return "–";
  if (value > 0 && value < 1) return "<1%";
  return `${Math.round(value)}%`;
}

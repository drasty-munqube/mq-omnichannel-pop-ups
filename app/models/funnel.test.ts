import { describe, expect, it } from "vitest";

import { addFunnelRow, emptyFunnelCounts, formatPct, popupStepFunnel, visitorFunnel } from "./funnel";

function counts() {
  const c = emptyFunnelCounts();
  addFunnelRow(c, { type: "view", hasEmail: null, hasPhone: null, count: 200 });
  addFunnelRow(c, { type: "open", hasEmail: null, hasPhone: null, count: 50 });
  addFunnelRow(c, { type: "dismiss", hasEmail: null, hasPhone: null, count: 30 });
  addFunnelRow(c, { type: "submit", hasEmail: true, hasPhone: false, count: 8 });
  addFunnelRow(c, { type: "submit", hasEmail: true, hasPhone: true, count: 2 });
  addFunnelRow(c, { type: "submit", hasEmail: false, hasPhone: true, count: 1 });
  addFunnelRow(c, { type: "submit", hasEmail: null, hasPhone: null, count: 4 });
  return c;
}

describe("funnels", () => {
  it("adds up popup events, splitting submits by email and phone", () => {
    expect(counts()).toEqual({ views: 200, opens: 50, submits: 15, dismisses: 30, withEmail: 10, withPhone: 3, unflaggedSubmits: 4 });
  });

  it("visitor funnel compares every step with viewed popup, and leaves Made order untracked", () => {
    const steps = visitorFunnel(counts());
    expect(steps.map((s) => [s.key, s.value, s.ofFirst])).toEqual([
      ["viewed", 200, 100],
      ["email", 10, 5],
      ["phone", 3, 1.5],
      ["order", null, null],
    ]);
    expect(steps[3].note).toBe("Needs order tracking");
  });

  it("popup step funnel compares each step with the one before", () => {
    const steps = popupStepFunnel(counts());
    expect(steps.map((s) => [s.value, s.ofPrevious])).toEqual([
      [200, null],
      [50, 25],
      [15, 30],
    ]);
  });

  it("shows no rate when nothing was seen", () => {
    const steps = popupStepFunnel(emptyFunnelCounts());
    expect(steps.map((s) => s.ofFirst)).toEqual([null, null, null]);
    expect(formatPct(null)).toBe("–");
    expect(formatPct(0.4)).toBe("<1%");
    expect(formatPct(24.6)).toBe("25%");
  });
});

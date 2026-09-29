/* ============================================================
   FUNNEL CHART

   Horizontal bars, one per step, all measured against the first
   step so the drop-off reads left to right and top to bottom.
   One series in the brand navy; every step carries its value and
   rate as text, so nothing depends on colour. Hovering or focusing
   a step shows the full numbers. A step that is not tracked yet
   shows why instead of a bar, never a misleading zero.
   ============================================================ */

import { useState } from "react";

import { color, fontWeight, navy, radius, shadow, space, text } from "../design/tokens";
import { formatPct, type FunnelStep } from "../models/funnel";

const BAR = navy[500];
const BAR_HOVER = navy[600];

export function FunnelChart({
  label,
  steps,
  compare,
}: {
  /* Names the chart for screen readers. */
  label: string;
  steps: FunnelStep[];
  /* Which rate leads under each value. */
  compare: "first" | "previous";
}) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...steps.map((s) => s.value ?? 0));

  return (
    <div role="list" aria-label={label} style={{ display: "grid", gap: space[5] }}>
      {steps.map((s, i) => {
        const rate = compare === "first" ? s.ofFirst : s.ofPrevious;
        const showRate = i > 0 && s.value !== null;
        const width = s.value === null ? 0 : (s.value / max) * 100;
        const isActive = active === s.key;
        const tip =
          s.value === null
            ? `${s.label}: ${s.note || "Not tracked"}`
            : [
                `${s.label}: ${s.value.toLocaleString()}`,
                i > 0 ? `${formatPct(s.ofFirst)} of ${steps[0].label.toLowerCase()}` : null,
                i > 1 && compare === "previous" ? `${formatPct(s.ofPrevious)} of the step before` : null,
              ]
                .filter(Boolean)
                .join(" · ");

        return (
          <div
            key={s.key}
            role="listitem"
            tabIndex={0}
            aria-label={tip}
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive((k) => (k === s.key ? null : k))}
            onFocus={() => setActive(s.key)}
            onBlur={() => setActive((k) => (k === s.key ? null : k))}
            style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: space[5], rowGap: space[2], outline: "none", position: "relative" }}
          >
            <span style={{ flex: "0 0 170px", ...text.bodySm, color: s.value === null ? color.textMuted : color.text, fontWeight: fontWeight.medium }}>
              {s.label}
            </span>

            <div style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: space[4], minWidth: 0, position: "relative" }}>
              {s.value === null ? (
                <span
                  style={{
                    flex: 1,
                    height: "20px",
                    borderRadius: radius.sm,
                    border: `1px dashed ${color.borderStrong}`,
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: space[4],
                    ...text.caption,
                    color: color.textMuted,
                  }}
                >
                  {s.note || "Not tracked"}
                </span>
              ) : (
                <>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0, borderLeft: `1px solid ${color.borderStrong}`, height: "28px" }}>
                    <span
                      aria-hidden
                      style={{
                        display: "block",
                        width: `${width}%`,
                        minWidth: s.value > 0 ? "3px" : 0,
                        height: "20px",
                        background: isActive ? BAR_HOVER : BAR,
                        borderRadius: "0 4px 4px 0",
                        transition: "width 300ms ease, background 120ms ease",
                      }}
                    />
                  </div>
                  <span style={{ flex: "0 0 auto", minWidth: "84px", textAlign: "right", ...text.bodySm, color: color.textStrong, fontWeight: fontWeight.semibold, fontVariantNumeric: "tabular-nums" }}>
                    {s.value.toLocaleString()}
                    {showRate ? <span style={{ marginLeft: space[3], color: color.textMuted, fontWeight: fontWeight.regular }}>{formatPct(rate)}</span> : null}
                  </span>
                </>
              )}

              {isActive ? (
                <span
                  role="tooltip"
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: "calc(100% + 6px)",
                    zIndex: 2,
                    padding: `${space[3]} ${space[4]}`,
                    borderRadius: radius.md,
                    background: color.textStrong,
                    color: color.textOnFilled,
                    boxShadow: shadow.md,
                    ...text.caption,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  {tip}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

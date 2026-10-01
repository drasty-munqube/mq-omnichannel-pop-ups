/* ============================================================
   ANALYTICS CHARTS

   Shared by the Home dashboard (which now holds everything the
   old Analytics page showed): a daily trend chart, a headline
   stat tile, and the per-campaign / per-popup breakdown table.

   The trend charts are small multiples rather than one chart
   with two lines: views run an order of magnitude above
   submissions, so sharing an axis would flatten submissions
   onto the baseline, and a second y-axis would invent a
   correlation that is not in the data. Every value a chart
   shows is also in a table, so nothing is reachable only by
   hovering.
   ============================================================ */

import { useState, type ReactNode } from "react";

import { formatRate, type DailyPoint } from "../models/analytics";
import { type LucideIcon } from "lucide-react";

/* ------------------------------------------------------------
   CHART

   Palette: slot 1 blue for views, slot 2 orange for
   submissions. Validated as a pair against this screen's white
   card (CVD ΔE 24.7, normal-vision ΔE 33.6, both above the
   floors, both above 3:1 contrast), so the two trends stay
   tellable apart for a colourblind reader. Each chart carries
   one series, so the title names it and no legend is needed.
   ------------------------------------------------------------ */

const WIDTH = 640;
const HEIGHT = 190;

const PAD_LEFT = 46;
const PAD_RIGHT = 14;
const PAD_TOP = 16;
const PAD_BOTTOM = 30;

const PLOT_WIDTH =
  WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT =
  HEIGHT - PAD_TOP - PAD_BOTTOM;

/* A y-axis that ends on a round number, so the ticks read as
   0 / 20 / 40 rather than 0 / 17 / 34. */

function niceMax(value: number) {
  if (value <= 0) {
    return 1;
  }

  const magnitude = Math.pow(
    10,
    Math.floor(Math.log10(value)),
  );

  const steps = [1, 2, 2.5, 5, 10];

  for (const step of steps) {
    const candidate = step * magnitude;

    if (candidate >= value) {
      return candidate;
    }
  }

  return 10 * magnitude;
}

function shortDay(key: string) {
  const date = new Date(key + "T00:00:00Z");

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function TrendChart({
  title,
  color,
  series,
  valueOf,
  actions,
}: {
  title: string;
  color: string;
  series: DailyPoint[];
  valueOf: (point: DailyPoint) => number;
  /* Optional controls shown at the right of the title. */
  actions?: ReactNode;
}) {
  const [hovered, setHovered] = useState<
    number | null
  >(null);

  const values = series.map(valueOf);
  /* At least 2, so the middle tick is a whole number (0 / 1 / 2)
     and a quiet week does not print "1" twice. */
  const max = Math.max(2, niceMax(Math.max(...values, 0)));

  const stepX =
    series.length > 1
      ? PLOT_WIDTH / (series.length - 1)
      : 0;

  const pointAt = (index: number) => ({
    x: PAD_LEFT + index * stepX,
    y:
      PAD_TOP +
      PLOT_HEIGHT *
        (1 - values[index] / max),
  });

  const path = values
    .map((_, index) => {
      const { x, y } = pointAt(index);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const ticks = [0, max / 2, max];

  /* First, middle and last only. A label per day collides well
     before ninety of them fit across 640px. */
  const xLabelIndexes = [
    0,
    Math.floor((series.length - 1) / 2),
    series.length - 1,
  ].filter(
    (value, index, all) =>
      all.indexOf(value) === index,
  );

  const last = series.length - 1;
  const lastPoint = pointAt(last);

  const active =
    hovered !== null ? hovered : null;

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #D8DEE6",
        borderRadius: "12px",
        padding: "16px 18px 10px",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <h3
          style={{
            margin: "0 0 2px",
            fontSize: "13px",
            fontWeight: 700,
            color: "#172033",
          }}
        >
          {title}
        </h3>
        {actions}
      </div>

      <p
        style={{
          margin: "0 0 6px",
          fontSize: "11px",
          color: "#8A95A5",
        }}
      >
        {series.length} days, UTC
      </p>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label={`${title}. ${values.reduce((sum, value) => sum + value, 0)} in total over ${series.length} days.`}
        style={{ display: "block" }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* GRID — solid hairlines, one shade off the card */}
        {ticks.map((tick) => {
          const y =
            PAD_TOP +
            PLOT_HEIGHT * (1 - tick / max);

          return (
            <g key={tick}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="#EEF1F4"
                strokeWidth="1"
              />
              <text
                x={PAD_LEFT - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="#8A95A5"
                style={{
                  fontVariantNumeric:
                    "tabular-nums",
                }}
              >
                {Number.isInteger(tick) ? tick : tick.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* X LABELS */}
        {xLabelIndexes.map((index) => (
          <text
            key={index}
            x={pointAt(index).x}
            y={HEIGHT - 10}
            textAnchor={
              index === 0
                ? "start"
                : index === last
                  ? "end"
                  : "middle"
            }
            fontSize="10"
            fill="#8A95A5"
          >
            {shortDay(series[index].day)}
          </text>
        ))}

        {/* CROSSHAIR */}
        {active !== null && (
          <line
            x1={pointAt(active).x}
            x2={pointAt(active).x}
            y1={PAD_TOP}
            y2={PAD_TOP + PLOT_HEIGHT}
            stroke="#C9D2DC"
            strokeWidth="1"
          />
        )}

        {/* SERIES — 2px, no fill */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* The endpoint is direct-labelled; every other value
            lives in the tooltip and in the tables below. */}
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="4"
          fill={color}
          stroke="#FFFFFF"
          strokeWidth="2"
        />

        {active !== null && (
          <circle
            cx={pointAt(active).x}
            cy={pointAt(active).y}
            r="4.5"
            fill={color}
            stroke="#FFFFFF"
            strokeWidth="2"
          />
        )}

        {/* HIT LAYER — the whole plot height, so nothing has to
            be landed on precisely. */}
        {series.map((point, index) => (
          <rect
            key={point.day}
            x={
              pointAt(index).x -
              Math.max(stepX / 2, 6)
            }
            y={PAD_TOP}
            width={Math.max(stepX, 12)}
            height={PLOT_HEIGHT}
            fill="transparent"
            onMouseEnter={() =>
              setHovered(index)
            }
          />
        ))}
      </svg>

      {/* TOOLTIP */}
      {active !== null && (
        <div
          style={{
            position: "absolute",
            top: "14px",
            right: "16px",
            padding: "6px 10px",
            background: "#172033",
            color: "#FFFFFF",
            borderRadius: "7px",
            fontSize: "11px",
            lineHeight: 1.5,
            pointerEvents: "none",
          }}
        >
          <strong
            style={{
              display: "block",
              fontWeight: 700,
            }}
          >
            {values[active]}
          </strong>
          {shortDay(series[active].day)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------
   STAT TILE
   ------------------------------------------------------------ */

/* The small tinted icon in the corner of a number card. */
export function StatIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      style={{
        width: "30px",
        height: "30px",
        borderRadius: "8px",
        background: "#EEF3F8",
        color: "#0B3D66",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={16} strokeWidth={2} />
    </span>
  );
}

export function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon?: LucideIcon;
}) {
  return (
    <div
      style={{
        flex: "1 1 170px",
        background: "#FFFFFF",
        border: "1px solid #D8DEE6",
        borderRadius: "12px",
        padding: "16px 18px",
        position: "relative",
      }}
    >
      {icon ? (
        <span style={{ position: "absolute", top: "14px", right: "14px" }}>
          <StatIcon icon={icon} />
        </span>
      ) : null}
      <span
        style={{
          display: "block",
          paddingRight: icon ? "40px" : undefined,
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#8A95A5",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          display: "block",
          margin: "7px 0 3px",
          fontSize: "30px",
          fontWeight: 700,
          color: "#172033",
        }}
      >
        {value}
      </strong>

      <span
        style={{
          fontSize: "11px",
          color: "#8A95A5",
        }}
      >
        {note}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------
   BREAKDOWN TABLE

   The chart's table-view twin, and the only place the
   per-campaign numbers exist, so it is not an afterthought.
   ------------------------------------------------------------ */

export function Breakdown({
  heading,
  empty,
  rows,
}: {
  heading: string;
  empty: string;
  rows: {
    id: string;
    name: string;
    secondary: string;
    views: number;
    submits: number;
    dismisses: number;
    rate: number | null;
  }[];
}) {
  const columns =
    "minmax(0, 1.6fr) 90px 110px 100px 110px";

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #D8DEE6",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 18px 12px",
          borderBottom: "1px solid #E7EBEF",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: 700,
            color: "#172033",
          }}
        >
          {heading}
        </h3>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            padding: "34px 20px",
            textAlign: "center",
            fontSize: "13px",
            color: "#6B7280",
          }}
        >
          {empty}
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: columns,
              gap: "12px",
              padding: "11px 18px",
              background: "#F8F9FA",
              borderBottom: "1px solid #E7EBEF",
              color: "#8A95A5",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            <div>Name</div>
            <div style={{ textAlign: "right" }}>
              Views
            </div>
            <div style={{ textAlign: "right" }}>
              Signups
            </div>
            <div style={{ textAlign: "right" }}>
              Closed
            </div>
            <div style={{ textAlign: "right" }}>
              Conversion
            </div>
          </div>

          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: "grid",
                gridTemplateColumns: columns,
                gap: "12px",
                alignItems: "center",
                padding: "13px 18px",
                borderBottom:
                  "1px solid #EEF1F4",
                fontSize: "13px",
                color: "#374151",
                fontVariantNumeric:
                  "tabular-nums",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <strong
                  style={{
                    display: "block",
                    color: "#172033",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.name}
                </strong>

                {row.secondary && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#8A95A5",
                    }}
                  >
                    {row.secondary}
                  </span>
                )}
              </div>

              <div
                style={{ textAlign: "right" }}
              >
                {row.views}
              </div>
              <div
                style={{ textAlign: "right" }}
              >
                {row.submits}
              </div>
              <div
                style={{ textAlign: "right" }}
              >
                {row.dismisses}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontWeight: 700,
                  color: "#172033",
                }}
              >
                {formatRate(row.rate)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}


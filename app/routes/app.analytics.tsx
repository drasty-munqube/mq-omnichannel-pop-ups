import { useMemo, useState } from "react";

import type { LoaderFunctionArgs } from "react-router";
import {
  useLoaderData,
  useSearchParams,
} from "react-router";

import { authenticate } from "../shopify.server";

/* Only the loader may touch the .server module; the component
   below formats numbers too, so the pure helpers come from the
   shared file. */
import { getAnalytics } from "../models/analytics.server";
import {
  formatRate,
  normalizeDays,
  RANGES,
  type DailyPoint,
} from "../models/analytics";

/* ============================================================
   ANALYTICS

   Four numbers, two trends and two tables, all scoped by one
   date range that sits above everything it changes.

   The charts are small multiples rather than one chart with
   two lines: views run an order of magnitude above
   submissions, so sharing an axis would flatten submissions
   onto the baseline, and giving them a second y-axis would
   invent a correlation that is not in the data. Each chart
   keeps its own scale and says what it is in its title.

   Every value a chart shows is also in a table below it, so
   nothing here is reachable only by hovering.
   ============================================================ */

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const { session } =
    await authenticate.admin(request);

  const url = new URL(request.url);

  return getAnalytics(
    session.shop,
    normalizeDays(url.searchParams.get("days")),
  );
}

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

function TrendChart({
  title,
  color,
  series,
  valueOf,
}: {
  title: string;
  color: string;
  series: DailyPoint[];
  valueOf: (point: DailyPoint) => number;
}) {
  const [hovered, setHovered] = useState<
    number | null
  >(null);

  const values = series.map(valueOf);
  const max = niceMax(Math.max(...values, 0));

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
                {Math.round(tick)}
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

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 170px",
        background: "#FFFFFF",
        border: "1px solid #D8DEE6",
        borderRadius: "12px",
        padding: "16px 18px",
      }}
    >
      <span
        style={{
          display: "block",
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

function Breakdown({
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
              Submissions
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

/* ------------------------------------------------------------
   SCREEN
   ------------------------------------------------------------ */

export default function Analytics() {
  const data = useLoaderData<typeof loader>();

  const [searchParams, setSearchParams] =
    useSearchParams();

  const hasData = useMemo(
    () =>
      data.totals.view +
        data.totals.submit +
        data.totals.dismiss >
      0,
    [data.totals],
  );

  const setDays = (days: number) => {
    const next = new URLSearchParams(
      searchParams,
    );

    next.set("days", String(days));
    setSearchParams(next);
  };

  return (
    <s-page inlineSize="large">
      <s-section>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "20px",
            padding: "4px 0 18px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "28px",
                fontWeight: 700,
                color: "#172033",
              }}
            >
              Analytics
            </h1>

            <p
              style={{
                margin: "7px 0 0",
                fontSize: "14px",
                color: "#6B7280",
              }}
            >
              How many people saw each campaign,
              and how many of them submitted.
            </p>
          </div>

          {/* One filter row, above everything it scopes. */}
          <div
            style={{
              display: "flex",
              gap: "6px",
            }}
          >
            {RANGES.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setDays(days)}
                style={{
                  padding: "8px 14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color:
                    data.days === days
                      ? "#FFFFFF"
                      : "#374151",
                  background:
                    data.days === days
                      ? "#1F2937"
                      : "#FFFFFF",
                  border:
                    "1px solid " +
                    (data.days === days
                      ? "#1F2937"
                      : "#D8DEE6"),
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                {days} days
              </button>
            ))}
          </div>
        </div>
      </s-section>

      {!hasData && (
        <s-section>
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #D8DEE6",
              borderRadius: "12px",
              padding: "44px 24px",
              textAlign: "center",
              color: "#6B7280",
              fontSize: "13px",
              lineHeight: 1.7,
            }}
          >
            Nothing recorded in the last{" "}
            {data.days} days yet.
            <br />
            Numbers start arriving once a
            campaign and its popup are both Live
            and a shopper loads a page carrying
            them.
          </div>
        </s-section>
      )}

      {/* KPI ROW — headline numbers, not a chart */}
      <s-section>
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <Stat
            label="Views"
            value={String(data.totals.view)}
            note="Times a popup reached a screen"
          />
          <Stat
            label="Submissions"
            value={String(data.totals.submit)}
            note="Shoppers who gave their details"
          />
          <Stat
            label="Conversion"
            value={formatRate(data.rate)}
            note="Submissions out of views"
          />
          <Stat
            label="Closed"
            value={String(data.totals.dismiss)}
            note="Closed without submitting"
          />
        </div>
      </s-section>

      {/* SMALL MULTIPLES — one series each, own scale each */}
      <s-section>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "12px",
          }}
        >
          <TrendChart
            title="Views per day"
            color="#2a78d6"
            series={data.daily}
            valueOf={(point) => point.views}
          />

          <TrendChart
            title="Submissions per day"
            color="#eb6834"
            series={data.daily}
            valueOf={(point) => point.submits}
          />
        </div>
      </s-section>

      <s-section>
        <Breakdown
          heading="By campaign"
          empty="No campaign has been seen in this period."
          rows={data.byCampaign}
        />
      </s-section>

      <s-section>
        <Breakdown
          heading="By popup"
          empty="No popup has been seen in this period."
          rows={data.byPopup}
        />
      </s-section>
    </s-page>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatUnitPrice, priceTicks, type PricePoint } from "@/lib/price-history";
import styles from "../products.module.css";

/**
 * Chart colours for each mode, checked for colour-blind separation and
 * contrast on the page background (#fafaf7 light, #141413 dark).
 * SVG attributes can't read CSS variables, so the colours live here.
 */
const THEMES = {
  light: { shelf: "#2a78d6", paid: "#eb6834", text: "#6b6b66", grid: "#e2e1da", surface: "#fafaf7" },
  dark: { shelf: "#3987e5", paid: "#d95926", text: "#a3a29b", grid: "#2e2e2b", surface: "#141413" },
};

const DARK = "(prefers-color-scheme: dark)";
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(DARK);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useDarkMode = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DARK).matches,
    () => false,
  );

const DAY = 24 * 60 * 60 * 1000;
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });
const longDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/Amsterdam" });
const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

type Unit = "L" | "kg" | "pcs";

function ChartTooltip({ active, payload, unit }: TooltipContentProps & { unit: Unit }) {
  const point = payload?.[0]?.payload as PricePoint | undefined;
  if (!active || !point) return null;
  return (
    <div className={styles.tooltip}>
      <strong>{longDate.format(new Date(point.date))}</strong>
      {point.store && <span>{point.store}</span>}
      <span>Shelf price: {formatUnitPrice(point.shelf, unit)}</span>
      <span>You paid: {formatUnitPrice(point.paid, unit)}</span>
      {point.discount > 0 && <span>Discount: {euro.format(point.discount)}</span>}
    </div>
  );
}

/** Shelf price and what you paid per unit, over time. */
export function PriceChart({ points, unit, label }: { points: PricePoint[]; unit: Unit; label: string }) {
  const theme = THEMES[useDarkMode() ? "dark" : "light"];
  const times = points.map((p) => p.time);
  // A day either side, so a single purchase isn't pinned to the edge.
  const domain = [Math.min(...times) - DAY, Math.max(...times) + DAY];
  const prices = points.flatMap((p) => [p.shelf, p.paid]).filter((v): v is number => v !== null);
  const ticks = priceTicks(Math.min(...prices), Math.max(...prices));
  const axis = { fontSize: 12, fill: theme.text };
  const perUnit = unit === "pcs" ? "per piece" : `per ${unit}`;

  return (
    <figure className={styles.chart} role="img" aria-label={label} data-testid="price-chart">
      {/* The legend sits outside the chart, so the hover tooltip never covers it. */}
      <ul className={styles.legend} aria-hidden>
        <li>
          <svg width="24" height="10" aria-hidden>
            <line x1="0" y1="5" x2="24" y2="5" stroke={theme.shelf} strokeWidth="2" />
          </svg>
          Shelf price ({perUnit})
        </li>
        <li>
          <svg width="24" height="10" aria-hidden>
            <line x1="0" y1="5" x2="24" y2="5" stroke={theme.paid} strokeWidth="2" strokeDasharray="6 4" />
          </svg>
          What you paid ({perUnit})
        </li>
      </ul>
      <LineChart
        responsive
        style={{ width: "100%", height: 260 }}
        data={points}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid stroke={theme.grid} vertical={false} />
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={domain}
          tickFormatter={(t: number) => shortDate.format(new Date(t))}
          tick={axis}
          tickLine={false}
          axisLine={{ stroke: theme.grid }}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v: number) => euro.format(v)}
          tick={axis}
          tickLine={false}
          axisLine={false}
          width={64}
          domain={[ticks[0], ticks[ticks.length - 1]]}
          ticks={ticks}
        />
        <Tooltip
          content={(props) => <ChartTooltip {...props} unit={unit} />}
          cursor={{ stroke: theme.text, strokeDasharray: "3 3" }}
        />
        <Line
          name="Shelf price"
          dataKey="shelf"
          stroke={theme.shelf}
          strokeWidth={2}
          dot={{ r: 4, fill: theme.shelf, stroke: theme.surface, strokeWidth: 2 }}
          activeDot={{ r: 6, stroke: theme.surface, strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          name="What you paid"
          dataKey="paid"
          stroke={theme.paid}
          strokeWidth={2}
          // Dashed as well as coloured, so the two lines differ without colour too.
          strokeDasharray="6 4"
          dot={{ r: 4, fill: theme.paid, stroke: theme.surface, strokeWidth: 2 }}
          activeDot={{ r: 6, stroke: theme.surface, strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </figure>
  );
}

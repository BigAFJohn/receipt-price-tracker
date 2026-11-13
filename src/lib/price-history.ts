/**
 * Price history for one product, from the price_history view: one row per
 * confirmed, non-deposit receipt line matched to the product.
 *
 * Two unit prices per purchase:
 * - shelf: the price before any discount, per L, kg or piece. Bonus offers
 *   don't move it, so it shows real price changes.
 * - paid: what you actually paid per unit, after discounts.
 */

export type PriceHistoryRow = {
  line_id: string;
  purchased_at: string;
  store: string | null;
  quantity: number | string;
  line_total: number | string;
  discount: number | string;
  shelf_unit_price: number | string | null;
  effective_unit_price: number | string | null;
};

export type PricePoint = {
  lineId: string;
  /** ISO timestamp of the purchase. */
  date: string;
  /** Milliseconds since 1970, for the chart's time axis. */
  time: number;
  store: string | null;
  quantity: number;
  /** Amount paid for the line, after discount. */
  amount: number;
  discount: number;
  shelf: number | null;
  paid: number | null;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

/** Oldest purchase first. Numeric columns may arrive as text; they become numbers. */
export function toPricePoints(rows: PriceHistoryRow[]): PricePoint[] {
  return rows
    .map((r) => ({
      lineId: r.line_id,
      date: r.purchased_at,
      time: Date.parse(r.purchased_at),
      store: r.store,
      quantity: Number(r.quantity),
      amount: Math.round((Number(r.line_total) - Number(r.discount)) * 100) / 100,
      discount: Number(r.discount),
      shelf: num(r.shelf_unit_price),
      paid: num(r.effective_unit_price),
    }))
    .sort((a, b) => a.time - b.time);
}

export type PriceSummary = {
  purchases: number;
  latest: PricePoint;
  /** Lowest price paid per unit, after discounts. */
  lowestPaid: PricePoint | null;
  /** Change in shelf price from the first purchase to the latest, in percent; null with one price. */
  shelfChangePercent: number | null;
  /** The store with the lowest average shelf price, when you've bought it at more than one. */
  cheapestStore: { store: string; averageShelf: number } | null;
};

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

export function summarize(points: PricePoint[]): PriceSummary | null {
  if (points.length === 0) return null;

  const latest = points[points.length - 1];
  const withPaid = points.filter((p) => p.paid !== null);
  const lowestPaid = withPaid.reduce<PricePoint | null>((low, p) => (!low || p.paid! < low.paid! ? p : low), null);

  const shelves = points.filter((p) => p.shelf !== null);
  const first = shelves[0];
  const last = shelves[shelves.length - 1];
  const shelfChangePercent =
    shelves.length >= 2 && first.shelf! > 0 ? round(((last.shelf! - first.shelf!) / first.shelf!) * 100, 1) : null;

  const byStore = new Map<string, number[]>();
  for (const p of shelves) {
    if (!p.store) continue;
    byStore.set(p.store, [...(byStore.get(p.store) ?? []), p.shelf!]);
  }
  const averages = [...byStore].map(([store, prices]) => ({
    store,
    averageShelf: round(prices.reduce((a, b) => a + b, 0) / prices.length, 4),
  }));
  const cheapestStore =
    averages.length >= 2 ? averages.reduce((low, s) => (s.averageShelf < low.averageShelf ? s : low)) : null;

  return { purchases: points.length, latest, lowestPaid, shelfChangePercent, cheapestStore };
}

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const euro3 = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 3 });

/** True for a price set to a tenth of a cent, as fuel is (2,449); not for one worked out (1,1933). */
export function hasTenthsOfCents(value: number): boolean {
  const mills = value * 1000;
  return Math.abs(mills - Math.round(mills)) < 1e-6 && Math.round(mills) % 10 !== 0;
}

/** "€ 0,48"; a price set to a tenth of a cent keeps it: "€ 2,449". */
export function formatPrice(value: number): string {
  return hasTenthsOfCents(value) ? euro3.format(value) : euro.format(value);
}

/** "€ 1,19 per L", "€ 2,449 per L", "€ 0,48 per piece"; a dash when there's no unit price. */
export function formatUnitPrice(value: number | null, unit: "L" | "kg" | "pcs"): string {
  if (value === null) return "–";
  return `${formatPrice(value)} ${unit === "pcs" ? "per piece" : `per ${unit}`}`;
}

const amount = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 });

/**
 * How much was bought, for a product of this size: "36,36 L" of fuel or
 * "1,463 kg" of something weighed (a product sold per 1 L or 1 kg), "2×" for packs.
 */
export function quantityText(quantity: number, product: { sizeValue: number | null; unit: "L" | "kg" | "pcs" }): string {
  if (product.sizeValue === 1 && product.unit !== "pcs") return `${amount.format(quantity)} ${product.unit}`;
  return `${amount.format(quantity)}×`;
}

/**
 * Round steps for the price axis: € 0,90 · € 1,00 · € 1,10 rather than
 * € 0,92 · € 1,04 · € 1,15. Aims for about four steps, with a little room
 * above and below the prices.
 */
export function priceTicks(min: number, max: number): number[] {
  const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100];
  const range = Math.max(max - min, Math.abs(max) * 0.1, 0.04);
  const step = STEPS.find((s) => range / s <= 4) ?? STEPS[STEPS.length - 1];
  const lo = Math.max(0, Math.floor((min - range * 0.1) / step) * step);
  const hi = Math.ceil((max + range * 0.1) / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
  return ticks;
}

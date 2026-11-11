/**
 * Spending per month and category, and the products whose shelf price rose
 * the most. Pure functions over rows from the spending_lines and
 * price_history views, so they're easy to test.
 */

export type SpendingLine = {
  month: string; // "2026-11", on an Amsterdam calendar
  amount: number | string;
  is_deposit: boolean;
  product_id: string | null;
  category: string | null;
};

export const DEPOSITS = "Deposits";
export const NOT_MATCHED = "Not matched";
export const NO_CATEGORY = "No category";

/** Which group a line's spend counts towards. */
export function categoryOf(line: Pick<SpendingLine, "is_deposit" | "product_id" | "category">): string {
  if (line.is_deposit) return DEPOSITS;
  if (!line.product_id) return NOT_MATCHED;
  return line.category ?? NO_CATEGORY;
}

export type CategorySpend = { name: string; amount: number; /** Share of the month, 0–100. */ share: number };
export type MonthSpend = { month: string; total: number; categories: CategorySpend[] };

const cents = (n: number) => Math.round(n * 100) / 100;

/** Newest month first; within a month, the biggest category first. */
export function spendByMonth(lines: SpendingLine[]): MonthSpend[] {
  const months = new Map<string, Map<string, number>>();
  for (const line of lines) {
    const byCategory = months.get(line.month) ?? new Map<string, number>();
    const name = categoryOf(line);
    byCategory.set(name, (byCategory.get(name) ?? 0) + Number(line.amount));
    months.set(line.month, byCategory);
  }

  return [...months]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, byCategory]) => {
      const total = cents([...byCategory.values()].reduce((a, b) => a + b, 0));
      const categories = [...byCategory]
        .map(([name, amount]) => ({
          name,
          amount: cents(amount),
          share: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
        }))
        .filter((c) => c.amount !== 0)
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
      return { month, total, categories };
    });
}

/** "2026-11" → "November 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export type PriceRow = {
  product_id: string;
  product: string;
  size_unit: "L" | "kg" | "pcs" | null;
  store: string | null;
  purchased_at: string;
  shelf_unit_price: number | string | null;
};

export type PriceIncrease = {
  productId: string;
  product: string;
  store: string;
  unit: "L" | "kg" | "pcs";
  from: number;
  to: number;
  fromDate: string;
  toDate: string;
  /** Rounded to one decimal. */
  percent: number;
};

/**
 * Products whose shelf price went up, biggest rise first. Prices are only
 * compared within one store, so buying the same thing at a dearer shop
 * doesn't look like a price rise. One entry per product: its biggest rise.
 */
export function biggestIncreases(rows: PriceRow[], limit = 5): PriceIncrease[] {
  const groups = new Map<string, PriceRow[]>();
  for (const r of rows) {
    if (r.shelf_unit_price === null || !r.size_unit) continue;
    const key = `${r.product_id}|${r.store ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const best = new Map<string, PriceIncrease>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => Date.parse(a.purchased_at) - Date.parse(b.purchased_at));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const from = Number(first.shelf_unit_price);
    const to = Number(last.shelf_unit_price);
    if (from <= 0) continue;
    const percent = Math.round(((to - from) / from) * 1000) / 10;
    if (percent <= 0) continue;

    const rise: PriceIncrease = {
      productId: first.product_id,
      product: first.product,
      store: first.store ?? "Unknown store",
      unit: first.size_unit!,
      from,
      to,
      fromDate: first.purchased_at,
      toDate: last.purchased_at,
      percent,
    };
    const current = best.get(rise.productId);
    if (!current || rise.percent > current.percent) best.set(rise.productId, rise);
  }

  return [...best.values()].sort((a, b) => b.percent - a.percent || a.product.localeCompare(b.product)).slice(0, limit);
}

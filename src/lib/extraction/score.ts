import type { NormalizedReceipt } from "./normalize";

/** A golden receipt (tests/fixtures/receipts/*.json): the hand-checked answer. */
export type GoldenReceipt = {
  store: string;
  purchased_at: string;
  total: number;
  lines: {
    raw_text: string;
    sku?: string;
    quantity: number;
    is_weighed: boolean;
    unit_price: number;
    line_total: number;
    discount: number;
    is_deposit: boolean;
  }[];
};

export type Check = { field: string; expected: unknown; actual: unknown; ok: boolean };
export type Score = { passed: number; total: number; percent: number; checks: Check[] };

const sameMoney = (a: number, b: number) => Math.abs(a - b) <= 0.005;
const sameQty = (a: number, b: number) => Math.abs(a - b) <= 0.0005;
/** Receipts are stored to the minute, so seconds on a golden receipt don't count. */
const sameMinute = (a: string, b: string) =>
  Math.floor(Date.parse(a) / 60_000) === Math.floor(Date.parse(b) / 60_000);
const key = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Compares an extraction with the golden answer, field by field.
 * Lines are matched by their printed text, so order doesn't matter.
 * A missing line fails all its checks; an extra line counts as one failure.
 */
export function scoreExtraction(golden: GoldenReceipt, actual: NormalizedReceipt): Score {
  const checks: Check[] = [];
  const check = (field: string, expected: unknown, actualValue: unknown, ok: boolean) =>
    checks.push({ field, expected, actual: actualValue, ok });

  check("store", golden.store, actual.store, golden.store === actual.store);
  check(
    "purchased_at",
    golden.purchased_at,
    actual.purchased_at,
    !!actual.purchased_at && sameMinute(golden.purchased_at, actual.purchased_at),
  );
  check("total", golden.total, actual.total, sameMoney(golden.total, actual.total));
  check("line count", golden.lines.length, actual.lines.length, golden.lines.length === actual.lines.length);

  const unmatched = [...actual.lines];
  for (const g of golden.lines) {
    const i = unmatched.findIndex((a) => key(a.raw_text) === key(g.raw_text));
    const a = i >= 0 ? unmatched.splice(i, 1)[0] : undefined;
    const name = g.raw_text;

    check(`${name}: found`, true, !!a, !!a);
    check(`${name}: quantity`, g.quantity, a?.quantity, !!a && sameQty(g.quantity, a.quantity));
    check(`${name}: unit_price`, g.unit_price, a?.unit_price, !!a && sameMoney(g.unit_price, a.unit_price));
    check(`${name}: line_total`, g.line_total, a?.line_total, !!a && sameMoney(g.line_total, a.line_total));
    check(`${name}: discount`, g.discount, a?.discount, !!a && sameMoney(g.discount, a.discount));
    check(`${name}: is_weighed`, g.is_weighed, a?.is_weighed, !!a && g.is_weighed === a.is_weighed);
    check(`${name}: is_deposit`, g.is_deposit, a?.is_deposit, !!a && g.is_deposit === a.is_deposit);
    if (g.sku !== undefined) check(`${name}: sku`, g.sku, a?.sku, !!a && g.sku === a.sku);
  }

  for (const extra of unmatched) check(`unexpected line: ${extra.raw_text}`, undefined, extra.raw_text, false);

  const passed = checks.filter((c) => c.ok).length;
  return { passed, total: checks.length, percent: Math.round((passed / checks.length) * 1000) / 10, checks };
}
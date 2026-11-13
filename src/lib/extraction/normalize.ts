import { linesMatchTotal } from "@/lib/pricing";
import type { SuggestedProduct } from "@/lib/product-matching";
import { cleanStoreName } from "@/lib/stores";
import type { ExtractedLine, ExtractedReceipt } from "./schema";

export type NormalizedLine = {
  line_no: number;
  raw_text: string;
  sku: string | null;
  quantity: number;
  is_weighed: boolean;
  unit_price: number;
  line_total: number;
  discount: number;
  is_deposit: boolean;
  confidence: number;
  suggested_product: SuggestedProduct | null;
};

export type NormalizedReceipt = {
  /** The shop's name as read, tidied; null when none is printed. */
  store: string | null;
  store_branch: string | null;
  purchased_at: string | null; // ISO 8601 with the Amsterdam offset; null when no usable date was read
  total: number;
  lines: NormalizedLine[];
  totals_match: boolean;
};

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * "2026-11-08" + "17:17" in Amsterdam → "2026-11-08T17:17:00+01:00".
 * Uses +01:00 in winter and +02:00 in summer, as the clock in the shop did.
 */
export function amsterdamToIso(date: string, time: string | null): string {
  const hhmm = time ?? "12:00";
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mi] = hhmm.split(":").map(Number);

  const offsetAt = (utcMs: number) => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Amsterdam", timeZoneName: "longOffset" })
      .formatToParts(new Date(utcMs))
      .find((p) => p.type === "timeZoneName")!.value; // "GMT+01:00"
    const match = name.match(/([+-])(\d{2}):(\d{2})/);
    if (!match) return { ms: 0, text: "+00:00" };
    const sign = match[1] === "-" ? -1 : 1;
    return { ms: sign * (Number(match[2]) * 60 + Number(match[3])) * 60_000, text: `${match[1]}${match[2]}:${match[3]}` };
  };

  const asUtc = Date.UTC(y, m - 1, d, hh, mi);
  const offset = offsetAt(asUtc - offsetAt(asUtc).ms);
  return `${date}T${hhmm}:00${offset.text}`;
}

/**
 * True for a real calendar date from 2000 up to tomorrow. Anything else
 * ("0000-00-00", 30 February, a misread year far in the future) is treated
 * as unread, so the review screen asks for the date instead.
 */
export function isPlausibleDate(date: string, now = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const isRealDate = day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d;
  const tomorrow = now.getTime() + 24 * 60 * 60 * 1000;
  return isRealDate && y >= 2000 && day.getTime() <= tomorrow;
}

/** True for a real 24-hour clock time, "00:00" to "23:59". */
export function isValidTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  return !!match && Number(match[1]) < 24 && Number(match[2]) < 60;
}

/**
 * Tidies Claude's product suggestion: no product for a deposit or a blank
 * name, and no size unless both the amount and the unit make sense.
 */
export function normalizeSuggestion(line: Pick<ExtractedLine, "is_deposit" | "product">): SuggestedProduct | null {
  const p = line.product;
  const name = p?.name.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!p || line.is_deposit || !name) return null;
  const hasSize = p.size_value !== null && p.size_value > 0 && p.size_value <= 100_000 && p.size_unit !== null;
  return {
    name,
    existing: p.existing,
    brand: p.brand?.trim().slice(0, 80) || null,
    size_value: hasSize ? round(p.size_value!, 3) : null,
    size_unit: hasSize ? p.size_unit : null,
    category: p.category,
  };
}

/** Rounds amounts, makes discounts positive, numbers the lines and checks the total. */
export function normalizeExtraction(raw: ExtractedReceipt): NormalizedReceipt {
  const lines = raw.lines.map((l, i) => ({
    line_no: i + 1,
    raw_text: l.raw_text.trim().replace(/\s+/g, " "),
    sku: l.sku?.trim() || null,
    quantity: round(l.quantity, 3),
    is_weighed: l.is_weighed,
    unit_price: round(l.unit_price, 2),
    line_total: round(l.line_total, 2),
    discount: round(Math.abs(l.discount), 2),
    is_deposit: l.is_deposit,
    confidence: Math.min(1, Math.max(0, l.confidence)),
    suggested_product: normalizeSuggestion(l),
  }));

  const total = round(raw.total, 2);

  return {
    store: raw.store?.trim() ? cleanStoreName(raw.store) : null,
    store_branch: raw.store_branch?.trim() || null,
    purchased_at:
      raw.purchase_date && isPlausibleDate(raw.purchase_date)
        ? amsterdamToIso(raw.purchase_date, raw.purchase_time && isValidTime(raw.purchase_time) ? raw.purchase_time : null)
        : null,
    total,
    lines,
    totals_match: linesMatchTotal(
      lines.map((l) => ({
        quantity: l.quantity,
        unitPrice: l.unit_price,
        lineTotal: l.line_total,
        discount: l.discount,
        isDeposit: l.is_deposit,
      })),
      total,
    ),
  };
}

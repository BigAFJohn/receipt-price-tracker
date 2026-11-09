import { linesMatchTotal } from "@/lib/pricing";
import type { ExtractedReceipt } from "./schema";

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
};

export type NormalizedReceipt = {
  store: string;
  store_branch: string | null;
  purchased_at: string; // ISO 8601 with the Amsterdam offset
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
  }));

  const total = round(raw.total, 2);

  return {
    store: raw.store,
    store_branch: raw.store_branch?.trim() || null,
    purchased_at: amsterdamToIso(raw.purchase_date, raw.purchase_time),
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
import { z } from "zod";

/**
 * Reads an amount as people type it: "2,58", "2.58", "€ 2,58" → 2.58.
 * Returns null for anything that isn't a plain number.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[€\s]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Shows an amount for editing: 2.5 → "2.50". Weights keep up to 3 decimals: 1.463 → "1.463". */
export function formatForInput(value: number, decimals = 2): string {
  return decimals === 2 ? value.toFixed(2) : String(Math.round(value * 10 ** decimals) / 10 ** decimals);
}

/** The date and time a stored timestamp shows on an Amsterdam clock: { date: "2026-11-08", time: "17:17" }. */
export function toAmsterdamParts(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

const amount = z.number().finite().min(0).max(100_000);

export const ReceiptLineInputSchema = z.object({
  raw_text: z.string().trim().min(1, "Every line needs a description").max(200),
  sku: z.string().trim().max(50).nullable(),
  quantity: z.number().finite().positive("Quantity must be more than 0").max(10_000),
  is_weighed: z.boolean(),
  unit_price: amount,
  line_total: amount,
  discount: amount,
  is_deposit: z.boolean(),
  confidence: z.number().min(0).max(1).nullable(),
});

/** What the review screen sends to the server. Checked again there: never trust the browser. */
export const ReceiptInputSchema = z.object({
  // guid(): any id in Postgres's uuid format; the database checks the store exists.
  store_id: z.guid("Choose a store from the list").nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the purchase date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Enter the purchase time"),
  total: amount,
  lines: z.array(ReceiptLineInputSchema).max(200),
});

export type ReceiptLineInput = z.infer<typeof ReceiptLineInputSchema>;
export type ReceiptInput = z.infer<typeof ReceiptInputSchema>;

/** Sum of what the lines cost after discounts, rounded to the cent. */
export function sumLines(lines: Pick<ReceiptLineInput, "line_total" | "discount">[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.line_total - l.discount, 0) * 100) / 100;
}
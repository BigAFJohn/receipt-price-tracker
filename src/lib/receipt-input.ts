import { z } from "zod";
import { SuggestedProductSchema } from "./product-matching";

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

/** Shows a price for editing: "2.50", and "2.449" for a price set to a tenth of a cent, as fuel is. */
export function formatPriceForInput(value: number): string {
  const mills = Math.round(value * 1000);
  return Math.abs(value * 1000 - mills) < 1e-6 && mills % 10 !== 0 ? value.toFixed(3) : value.toFixed(2);
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
  // guid(): any id in Postgres's uuid format; the database checks it's one of your products.
  product_id: z.guid("Choose a product from the list").nullable().default(null),
  suggested_product: SuggestedProductSchema.nullable().default(null),
});

/** What the review screen sends to the server. Checked again there: never trust the browser. */
export const ReceiptInputSchema = z.object({
  // guid(): any id in Postgres's uuid format; the database checks the store exists.
  store_id: z.guid("Choose a store from the list").nullable(),
  // A store to add (or find) when no store_id is chosen, e.g. "Jumbo" as Claude read it.
  new_store_name: z
    .string()
    .trim()
    .min(1, "Give the new store a name")
    .max(80, "Keep the store name under 80 characters")
    .nullable()
    .default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the purchase date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Enter the purchase time"),
  total: amount,
  lines: z.array(ReceiptLineInputSchema).max(200),
});

export type ReceiptLineInput = z.input<typeof ReceiptLineInputSchema>;
export type ReceiptInput = z.input<typeof ReceiptInputSchema>;

/** Sum of what the lines cost after discounts, rounded to the cent. */
export function sumLines(lines: Pick<ReceiptLineInput, "line_total" | "discount">[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.line_total - l.discount, 0) * 100) / 100;
}

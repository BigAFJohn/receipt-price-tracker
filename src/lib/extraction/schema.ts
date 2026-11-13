import { z } from "zod";

/** The shared stores everyone starts with (supabase/seed.sql); the app passes your own list. */
export const KNOWN_STORES = ["Albert Heijn", "Hoogvliet", "Kruidvat", "Action"];

/** The seeded categories (supabase/seed.sql); the app passes the database's own list. */
export const KNOWN_CATEGORIES = [
  "Drinks",
  "Dairy & eggs",
  "Bread & bakery",
  "Fruit & vegetables",
  "Meat & fish",
  "Pantry",
  "Frozen",
  "Snacks & sweets",
  "Household & cleaning",
  "Personal care",
  "Health & pharmacy",
  "Baby & kids",
  "Other",
];

const money = (what: string) =>
  z.number().describe(`${what}, in euros, as a number with a decimal point (2,58 → 2.58)`);

/** Claude's idea of which product a line is: one you track already, or a new one to add. */
function buildProductSchema(categories: string[]) {
  const categoryNames: [string, ...string[]] = categories.length ? [categories[0], ...categories.slice(1)] : ["Other"];

  return z
    .object({
      name: z
        .string()
        .describe(
          "When existing is true, the tracked product's name exactly as listed. Otherwise a short, readable name for a new product (AH HALFV MELK → Halfvolle melk)",
        ),
      existing: z
        .boolean()
        .describe("True when this line is one of the products already tracked, listed in the message"),
      brand: z.string().nullable().describe("Brand when printed or obvious (AH, Coca-Cola), otherwise null"),
      size_value: z
        .number()
        .nullable()
        .describe(
          "Pack size in litres, kilos or pieces (330ML → 0.33, 500G → 0.5, 6-PACK → 6); 1 for weighed items; null when unknown",
        ),
      size_unit: z.enum(["L", "kg", "pcs"]).nullable().describe("Unit of size_value; null when unknown"),
      category: z.enum(categoryNames).nullable().describe("Category from the list"),
    })
    .nullable()
    .describe("Which product this line is, so its price can be tracked over time. Null for deposits.");
}

function buildLineSchema(categories: string[]) {
  return z.object({
    raw_text: z
      .string()
      .describe(
        "The product description exactly as printed, without the article number. Join a description that wraps onto a second line with a single space.",
      ),
    sku: z
      .string()
      .nullable()
      .describe("Article number printed before the description (e.g. Action's 2547713), otherwise null"),
    quantity: z
      .number()
      .describe("Number of items, or the weight in kg for a weighed item (1,463kg → 1.463). 1 when not printed."),
    is_weighed: z.boolean().describe("True when the item is sold by weight (a kg amount and a price per kg)"),
    unit_price: money("Price per item, or per kg for a weighed item, before any discount"),
    line_total: money("Amount printed for this line, before any discount"),
    discount: money(
      "Discount applied to this item (Bonus, 1+1 gratis, korting), as a positive amount. 0 when none.",
    ),
    is_deposit: z.boolean().describe("True for statiegeld / deposit lines"),
    confidence: z.number().describe("How sure you are this line is read correctly, from 0 to 1"),
    product: buildProductSchema(categories),
  });
}

export const ExtractedLineSchema = buildLineSchema(KNOWN_CATEGORIES);

export function buildExtractionSchema(categories: string[] = KNOWN_CATEGORIES) {
  return z.object({
    is_receipt: z.boolean().describe("False when the photo is not a shop receipt"),
    store: z
      .string()
      .nullable()
      .describe(
        "The shop's everyday chain name (Albert Heijn, not AH or Albert Heijn B.V.). When it is one of the stores listed in the message, copy that name exactly. Null when no shop name is printed.",
      ),
    store_branch: z
      .string()
      .nullable()
      .describe("Branch name or town printed on the receipt (e.g. Lunetten, Utrecht), otherwise null"),
    purchase_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .describe(
        "Date of purchase as YYYY-MM-DD. Dutch receipts print day first: 08-11-2026 is 2026-11-08. Null when no date is printed or it can't be read; never make one up.",
      ),
    purchase_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .describe("Time of purchase as HH:MM (24-hour), or null when not printed"),
    total: money("Total amount paid (TOTAAL), after discounts"),
    lines: z.array(buildLineSchema(categories)).describe("One entry per purchased product, in the order printed"),
  });
}

export type ExtractedReceipt = z.infer<ReturnType<typeof buildExtractionSchema>>;
export type ExtractedLine = z.infer<typeof ExtractedLineSchema>;

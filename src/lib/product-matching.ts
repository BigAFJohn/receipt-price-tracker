import { z } from "zod";
import { formatSize, type StoredUnit } from "./product-size";

/**
 * How receipt text is compared: "  ah cola  zero " and "AH COLA ZERO" are the
 * same line. The database's receipt_text_key() does exactly the same.
 */
export function receiptTextKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Claude's idea of which product a line is: one you track already, or a new one. */
export const SuggestedProductSchema = z.object({
  name: z.string().trim().min(1).max(120),
  existing: z.boolean(),
  brand: z.string().trim().max(80).nullable(),
  size_value: z.number().positive().max(100_000).nullable(),
  size_unit: z.enum(["L", "kg", "pcs"]).nullable(),
  category: z.string().max(80).nullable(),
});

export type SuggestedProduct = z.infer<typeof SuggestedProductSchema>;

export type MatchSource = "remembered" | "suggested";

export type ProductMatch = { productId: string | null; source: MatchSource | null };

/**
 * Picks a line's product only from what you chose for the same text at the
 * same store before (`aliases`), so nothing is linked unless you confirmed it
 * once. Claude's guesses are offered on the review screen instead (see
 * `claudesGuess`). A deposit is never a product.
 */
export function matchProduct(
  line: { raw_text: string; is_deposit: boolean },
  aliases: Map<string, string>,
  products: { id: string }[],
): ProductMatch {
  if (line.is_deposit) return { productId: null, source: null };

  const remembered = aliases.get(receiptTextKey(line.raw_text));
  if (remembered && products.some((p) => p.id === remembered)) {
    return { productId: remembered, source: "remembered" };
  }
  return { productId: null, source: null };
}

/**
 * The tracked product Claude thinks a line is, if it named one you have.
 * Offered as a one-click choice, never chosen for you: Claude can confuse
 * products that share a store or brand name.
 */
export function claudesGuess<P extends { name: string }>(
  suggestion: SuggestedProduct | null,
  products: P[],
): P | null {
  if (!suggestion?.existing) return null;
  const name = suggestion.name.trim().toLowerCase();
  return products.find((p) => p.name.trim().toLowerCase() === name) ?? null;
}

/**
 * Lines with different receipt text linked to the same product: usually a
 * mistake (say, the orange juice linked to the croissant). Returns the line
 * numbers (from 1) per product, only for products that have such lines.
 */
export function sharedProducts(
  lines: { raw_text: string; is_deposit: boolean; product_id: string | null }[],
): Map<string, number[]> {
  const byProduct = new Map<string, { numbers: number[]; texts: Set<string> }>();
  lines.forEach((l, i) => {
    if (l.is_deposit || !l.product_id) return;
    const entry = byProduct.get(l.product_id) ?? { numbers: [], texts: new Set<string>() };
    entry.numbers.push(i + 1);
    entry.texts.add(receiptTextKey(l.raw_text));
    byProduct.set(l.product_id, entry);
  });
  return new Map(
    [...byProduct].filter(([, e]) => e.texts.size > 1).map(([productId, e]) => [productId, e.numbers]),
  );
}

type Labelled = { name: string; size_value: number | null; size_unit: StoredUnit | null };

/** How a product shows in the picker: "Coca-Cola Zero · 1,5 L". */
export function productLabel(p: Labelled): string {
  const size = p.size_value && p.size_unit ? formatSize(Number(p.size_value), p.size_unit) : null;
  return [p.name, size].filter(Boolean).join(" · ");
}

/**
 * The product typed or picked in a line's product field: its label as
 * suggested ("Coca-Cola Zero · 1,5 L"), or just its name. Case and spacing
 * don't count. A name two products share needs the label, to say which.
 */
export function findProduct<P extends Labelled & { id: string }>(text: string, products: P[]): P | null {
  const key = text.trim().replace(/\s+/g, " ").toLowerCase();
  if (!key) return null;
  const byLabel = products.find((p) => productLabel(p).toLowerCase() === key);
  if (byLabel) return byLabel;
  const byName = products.filter((p) => p.name.trim().replace(/\s+/g, " ").toLowerCase() === key);
  return byName.length === 1 ? byName[0] : null;
}

/** Products you buy most first, then by name: the order the product field suggests them in. */
export function byPurchases<P extends { name: string; purchases: number }>(products: P[]): P[] {
  return [...products].sort((a, b) => b.purchases - a.purchases || a.name.localeCompare(b.name));
}

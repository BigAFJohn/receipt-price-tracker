import { z } from "zod";

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
 * Picks a line's product:
 * 1. what you chose for the same text at the same store before (`aliases`),
 * 2. otherwise the product you already track that Claude named,
 * 3. otherwise none; the review screen offers Claude's new product instead.
 * A deposit is never a product.
 */
export function matchProduct(
  line: { raw_text: string; is_deposit: boolean; suggested_product: SuggestedProduct | null },
  aliases: Map<string, string>,
  products: { id: string; name: string }[],
): ProductMatch {
  if (line.is_deposit) return { productId: null, source: null };

  const remembered = aliases.get(receiptTextKey(line.raw_text));
  if (remembered && products.some((p) => p.id === remembered)) {
    return { productId: remembered, source: "remembered" };
  }

  const suggestion = line.suggested_product;
  if (suggestion?.existing) {
    const name = suggestion.name.trim().toLowerCase();
    const found = products.find((p) => p.name.trim().toLowerCase() === name);
    if (found) return { productId: found.id, source: "suggested" };
  }

  return { productId: null, source: null };
}

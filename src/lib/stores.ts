/**
 * Matching the shop name Claude reads to a store you have, so "AH",
 * "ALBERT HEIJN B.V." and "Albert Heijn" don't become three stores.
 */

/** The review form's "New store…" choice in the store picker. */
export const NEW_STORE = "new";

/** Company-form words a receipt may print after the shop's name. */
const COMPANY_FORMS = /\b(b\.?\s?v\.?|n\.?\s?v\.?|v\.?\s?o\.?\s?f\.?|ltd\.?|inc\.?|gmbh)$/i;

/** How store names are compared: case, spacing, "B.V." and the like don't count. */
export function storeKey(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(COMPANY_FORMS, "")
    .trim()
    .replace(/[.,]+$/, "")
    .toLowerCase();
}

/**
 * Short names a store is printed as on receipts, for the stores everyone
 * starts with. Your own stores match by name.
 */
const KNOWN_SHORT_NAMES: Record<string, string> = {
  ah: "albert heijn",
  "ah to go": "albert heijn",
};

/** The store with this name, if you have one. */
export function findStore<S extends { name: string }>(name: string | null, stores: S[]): S | null {
  if (!name?.trim()) return null;
  const key = storeKey(name);
  const wanted = KNOWN_SHORT_NAMES[key] ?? key;
  return stores.find((s) => storeKey(s.name) === wanted) ?? null;
}

/** A store name as it should be saved: tidy spacing, no company form, at most 80 characters. */
export function cleanStoreName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(COMPANY_FORMS, "")
    .trim()
    .replace(/[.,]+$/, "")
    .slice(0, 80);
}

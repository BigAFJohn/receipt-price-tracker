import { describe, expect, it } from "vitest";
import { matchProduct, receiptTextKey, type SuggestedProduct } from "./product-matching";

describe("receiptTextKey", () => {
  it("ignores spacing and case", () => {
    expect(receiptTextKey("  ah cola  zero ")).toBe("AH COLA ZERO");
    expect(receiptTextKey("AH COLA ZERO")).toBe("AH COLA ZERO");
  });
});

describe("matchProduct", () => {
  const products = [
    { id: "p-cola", name: "Coca-Cola Zero" },
    { id: "p-melk", name: "Halfvolle melk" },
  ];
  const aliases = new Map([["AH COLA ZERO 1,5L", "p-cola"]]);
  const suggestion = (s: Partial<SuggestedProduct>): SuggestedProduct => ({
    name: "Halfvolle melk",
    existing: true,
    brand: null,
    size_value: 1,
    size_unit: "L",
    category: "Dairy & eggs",
    ...s,
  });

  it("uses what you chose before for the same text", () => {
    const line = { raw_text: "ah cola zero 1,5l", is_deposit: false, suggested_product: suggestion({}) };
    // The earlier choice wins over Claude's guess.
    expect(matchProduct(line, aliases, products)).toEqual({ productId: "p-cola", source: "remembered" });
  });

  it("otherwise uses the tracked product Claude named, ignoring case", () => {
    const line = {
      raw_text: "AH HALFV MELK",
      is_deposit: false,
      suggested_product: suggestion({ name: "halfvolle MELK" }),
    };
    expect(matchProduct(line, aliases, products)).toEqual({ productId: "p-melk", source: "suggested" });
  });

  it("leaves a new product unmatched, so you can add it", () => {
    const line = {
      raw_text: "BLAUWE BES",
      is_deposit: false,
      suggested_product: suggestion({ name: "Blauwe bessen", existing: false }),
    };
    expect(matchProduct(line, aliases, products)).toEqual({ productId: null, source: null });
  });

  it("ignores a 'tracked' product Claude made up", () => {
    const line = { raw_text: "X", is_deposit: false, suggested_product: suggestion({ name: "Not a product" }) };
    expect(matchProduct(line, aliases, products).productId).toBeNull();
  });

  it("ignores a remembered product that has since been deleted", () => {
    const stale = new Map([["X", "p-deleted"]]);
    expect(matchProduct({ raw_text: "X", is_deposit: false, suggested_product: null }, stale, products).productId).toBeNull();
  });

  it("never matches a deposit", () => {
    const deposit = new Map([["STATIEGELD", "p-cola"]]);
    expect(
      matchProduct({ raw_text: "STATIEGELD", is_deposit: true, suggested_product: null }, deposit, products),
    ).toEqual({ productId: null, source: null });
  });
});

import { describe, expect, it } from "vitest";
import {
  byPurchases,
  claudesGuess,
  findProduct,
  matchProduct,
  productLabel,
  receiptTextKey,
  sharedProducts,
  type SuggestedProduct,
} from "./product-matching";

describe("receiptTextKey", () => {
  it("ignores spacing and case", () => {
    expect(receiptTextKey("  ah cola  zero ")).toBe("AH COLA ZERO");
    expect(receiptTextKey("AH COLA ZERO")).toBe("AH COLA ZERO");
  });
});

describe("matchProduct", () => {
  const products = [{ id: "p-cola" }, { id: "p-melk" }];
  const aliases = new Map([["AH COLA ZERO 1,5L", "p-cola"]]);

  it("uses what you chose before for the same text, ignoring spacing and case", () => {
    expect(matchProduct({ raw_text: "ah cola zero  1,5l", is_deposit: false }, aliases, products)).toEqual({
      productId: "p-cola",
      source: "remembered",
    });
  });

  it("chooses nothing for text you haven't matched before, whatever Claude thinks", () => {
    expect(matchProduct({ raw_text: "AH HALFV MELK", is_deposit: false }, aliases, products)).toEqual({
      productId: null,
      source: null,
    });
  });

  it("ignores a remembered product that has since been deleted", () => {
    const stale = new Map([["X", "p-deleted"]]);
    expect(matchProduct({ raw_text: "X", is_deposit: false }, stale, products).productId).toBeNull();
  });

  it("never matches a deposit", () => {
    const deposit = new Map([["STATIEGELD", "p-cola"]]);
    expect(matchProduct({ raw_text: "STATIEGELD", is_deposit: true }, deposit, products)).toEqual({
      productId: null,
      source: null,
    });
  });
});

describe("claudesGuess", () => {
  const products = [
    { id: "p-cola", name: "Coca-Cola Zero" },
    { id: "p-melk", name: "Halfvolle melk" },
  ];
  const suggestion = (s: Partial<SuggestedProduct>): SuggestedProduct => ({
    name: "Halfvolle melk",
    existing: true,
    brand: null,
    size_value: 1,
    size_unit: "L",
    category: "Dairy & eggs",
    ...s,
  });

  it("finds the tracked product Claude named, ignoring case", () => {
    expect(claudesGuess(suggestion({ name: "halfvolle MELK " }), products)?.id).toBe("p-melk");
  });

  it("has no guess for a new product, a made-up name or no suggestion", () => {
    expect(claudesGuess(suggestion({ existing: false }), products)).toBeNull();
    expect(claudesGuess(suggestion({ name: "Not a product" }), products)).toBeNull();
    expect(claudesGuess(null, products)).toBeNull();
  });
});

describe("sharedProducts", () => {
  const line = (raw_text: string, product_id: string | null, is_deposit = false) => ({ raw_text, product_id, is_deposit });

  it("finds different lines linked to the same product", () => {
    const shared = sharedProducts([
      line("HOOGVLIET CROISSANT", "p-croissant"),
      line("APPELSIENTJE MULTI", "p-croissant"),
      line("M&MS PINDA", "p-mms"),
      line("HOOGVLIET SAUCIJZEN", "p-croissant"),
    ]);
    expect([...shared]).toEqual([["p-croissant", [1, 2, 4]]]);
  });

  it("allows the same text twice, unlinked lines and deposits", () => {
    expect(
      sharedProducts([
        line("HOOGVLIET CROISSANT", "p-croissant"),
        line("hoogvliet  croissant", "p-croissant"),
        line("A", null),
        line("B", null),
        line("STATIEGELD", "p-croissant", true),
      ]).size,
    ).toBe(0);
  });
});

describe("product field", () => {
  const products = [
    { id: "cola", name: "Coca-Cola Zero", size_value: 1.5, size_unit: "L" as const },
    { id: "cola-can", name: "Coca-Cola Zero", size_value: 0.33, size_unit: "L" as const },
    { id: "melk", name: "Halfvolle melk", size_value: 1, size_unit: "L" as const },
    { id: "bananen", name: "Bananen", size_value: null, size_unit: null },
  ];

  it("labels a product with its size", () => {
    expect(productLabel(products[0])).toBe("Coca-Cola Zero · 1,5 L");
    expect(productLabel(products[1])).toBe("Coca-Cola Zero · 330 ml");
    expect(productLabel(products[3])).toBe("Bananen");
  });

  it("finds a product by its label or, when only one has it, its name", () => {
    expect(findProduct("Coca-Cola Zero · 330 ml", products)?.id).toBe("cola-can");
    expect(findProduct("  halfvolle   MELK ", products)?.id).toBe("melk");
    expect(findProduct("bananen", products)?.id).toBe("bananen");
  });

  it("needs the label when two products share a name, and finds nothing for a new name", () => {
    expect(findProduct("Coca-Cola Zero", products)).toBeNull();
    expect(findProduct("Pindakaas", products)).toBeNull();
    expect(findProduct("  ", products)).toBeNull();
  });

  it("suggests the products you buy most first", () => {
    const sorted = byPurchases([
      { name: "Bananen", purchases: 1 },
      { name: "Appels", purchases: 0 },
      { name: "Croissant", purchases: 4 },
    ]);
    expect(sorted.map((p) => p.name)).toEqual(["Croissant", "Bananen", "Appels"]);
  });
});

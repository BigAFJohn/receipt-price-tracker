import { describe, expect, it } from "vitest";
import {
  formatForInput,
  parseAmount,
  ReceiptInputSchema,
  sumLines,
  toAmsterdamParts,
  type ReceiptInput,
} from "./receipt-input";

describe("parseAmount", () => {
  it.each([
    ["2,58", 2.58],
    ["2.58", 2.58],
    ["€ 2,58", 2.58],
    [" 3 ", 3],
    ["1,463", 1.463],
    ["0", 0],
  ])("reads %s as %d", (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });

  it.each(["", "abc", "2,5,8", "1.234,56", "2,"])("rejects %s", (text) => {
    expect(parseAmount(text)).toBeNull();
  });
});

describe("formatForInput", () => {
  it("shows money with two decimals", () => {
    expect(formatForInput(2.5)).toBe("2.50");
  });

  it("shows weights without trailing zeros", () => {
    expect(formatForInput(1.463, 3)).toBe("1.463");
    expect(formatForInput(2, 3)).toBe("2");
  });
});

describe("toAmsterdamParts", () => {
  it("shows a winter time on the Amsterdam clock", () => {
    expect(toAmsterdamParts("2026-11-08T16:17:00Z")).toEqual({ date: "2026-11-08", time: "17:17" });
  });

  it("shows a summer time on the Amsterdam clock", () => {
    expect(toAmsterdamParts("2026-07-01T07:05:00Z")).toEqual({ date: "2026-07-01", time: "09:05" });
  });

  it("rolls over to the next day after midnight", () => {
    expect(toAmsterdamParts("2026-11-08T23:30:00Z")).toEqual({ date: "2026-11-09", time: "00:30" });
  });
});

describe("sumLines", () => {
  it("subtracts discounts and rounds to the cent", () => {
    // The AH receipt: 16.30 of lines, 1.10 of Bonus discounts
    const lines = [
      { line_total: 3.35, discount: 0 },
      { line_total: 4.49, discount: 0.5 },
      { line_total: 2.58, discount: 0 },
      { line_total: 2.99, discount: 0 },
      { line_total: 2.89, discount: 0.6 },
    ];
    expect(sumLines(lines)).toBe(15.2);
  });
});

describe("ReceiptInputSchema", () => {
  const valid: ReceiptInput = {
    store_id: "0b6a7a2e-4c1d-4f0e-9b7a-2d3c4e5f6a7b",
    date: "2026-11-08",
    time: "14:18",
    total: 2.87,
    lines: [
      {
        raw_text: " HOOGVLIET CROISSANT ",
        sku: null,
        quantity: 2,
        is_weighed: false,
        unit_price: 0.48,
        line_total: 0.96,
        discount: 0,
        is_deposit: false,
        confidence: 0.98,
      },
    ],
  };

  it("accepts a valid receipt and trims descriptions", () => {
    const parsed = ReceiptInputSchema.parse(valid);
    expect(parsed.lines[0].raw_text).toBe("HOOGVLIET CROISSANT");
  });

  it("accepts an unknown store", () => {
    expect(ReceiptInputSchema.safeParse({ ...valid, store_id: null }).success).toBe(true);
  });

  it.each([
    ["an empty description", { raw_text: "  " }],
    ["a zero quantity", { quantity: 0 }],
    ["a negative price", { unit_price: -1 }],
    ["a negative discount", { discount: -0.5 }],
  ])("rejects %s", (_name, change) => {
    const input = { ...valid, lines: [{ ...valid.lines[0], ...change }] };
    expect(ReceiptInputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts any store id in Postgres's uuid format", () => {
    const store_id = "00000000-0000-0000-0000-000000000002";
    expect(ReceiptInputSchema.safeParse({ ...valid, store_id }).success).toBe(true);
  });

  it("rejects a store id that isn't a uuid, with a readable message", () => {
    const result = ReceiptInputSchema.safeParse({ ...valid, store_id: "albert-heijn" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Choose a store from the list");
  });

  it("keeps a line's product and Claude's suggestion, and treats them as optional", () => {
    const product_id = "00000000-0000-0000-0000-000000000009";
    const suggested_product = {
      name: "Croissant",
      existing: false,
      brand: null,
      size_value: 1,
      size_unit: "pcs" as const,
      category: "Bread & bakery",
    };
    const parsed = ReceiptInputSchema.parse({ ...valid, lines: [{ ...valid.lines[0], product_id, suggested_product }] });
    expect(parsed.lines[0]).toMatchObject({ product_id, suggested_product });
    expect(ReceiptInputSchema.parse(valid).lines[0]).toMatchObject({ product_id: null, suggested_product: null });
  });

  it("rejects a product id that isn't a uuid, with a readable message", () => {
    const result = ReceiptInputSchema.safeParse({ ...valid, lines: [{ ...valid.lines[0], product_id: "cola" }] });
    expect(result.error?.issues[0].message).toBe("Choose a product from the list");
  });

  it("rejects a malformed date", () => {
    expect(ReceiptInputSchema.safeParse({ ...valid, date: "08-11-2026" }).success).toBe(false);
  });
});

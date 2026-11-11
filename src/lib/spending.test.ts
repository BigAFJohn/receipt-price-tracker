import { describe, expect, it } from "vitest";
import {
  biggestIncreases,
  categoryOf,
  DEPOSITS,
  monthLabel,
  NO_CATEGORY,
  NOT_MATCHED,
  spendByMonth,
  type PriceRow,
  type SpendingLine,
} from "./spending";

const line = (l: Partial<SpendingLine>): SpendingLine => ({
  month: "2026-11",
  amount: 1,
  is_deposit: false,
  product_id: "p1",
  category: "Drinks",
  ...l,
});

describe("categoryOf", () => {
  it("groups deposits, unmatched lines and products without a category", () => {
    expect(categoryOf(line({ is_deposit: true, product_id: null, category: null }))).toBe(DEPOSITS);
    expect(categoryOf(line({ product_id: null, category: null }))).toBe(NOT_MATCHED);
    expect(categoryOf(line({ category: null }))).toBe(NO_CATEGORY);
    expect(categoryOf(line({}))).toBe("Drinks");
  });
});

describe("spendByMonth", () => {
  const months = spendByMonth([
    line({ month: "2026-10", amount: "1.79" }),
    line({ amount: 3.08 }),
    line({ amount: 2.5, category: "Dairy & eggs" }),
    line({ amount: 0.3, is_deposit: true, product_id: null, category: null }),
    line({ amount: 0.41, product_id: null, category: null }),
    line({ amount: 0, category: "Frozen" }),
  ]);

  it("puts the newest month first, with totals to the cent", () => {
    expect(months.map((m) => [m.month, m.total])).toEqual([
      ["2026-11", 6.29],
      ["2026-10", 1.79],
    ]);
  });

  it("lists categories biggest first, with their share, and leaves out empty ones", () => {
    expect(months[0].categories).toEqual([
      { name: "Drinks", amount: 3.08, share: 49 },
      { name: "Dairy & eggs", amount: 2.5, share: 39.7 },
      { name: NOT_MATCHED, amount: 0.41, share: 6.5 },
      { name: DEPOSITS, amount: 0.3, share: 4.8 },
    ]);
  });

  it("has nothing for no receipts", () => {
    expect(spendByMonth([])).toEqual([]);
  });
});

describe("monthLabel", () => {
  it("names the month", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
    expect(monthLabel("2027-01")).toBe("January 2027");
  });
});

describe("biggestIncreases", () => {
  const row = (r: Partial<PriceRow>): PriceRow => ({
    product_id: "cola",
    product: "Coca-Cola Zero",
    size_unit: "L",
    store: "Albert Heijn",
    purchased_at: "2026-09-01T12:00:00+02:00",
    shelf_unit_price: 1.19,
    ...r,
  });

  it("compares the first and latest shelf price at the same store", () => {
    const [rise] = biggestIncreases([
      row({ purchased_at: "2026-11-01T12:00:00+01:00", shelf_unit_price: "1.33" }),
      row({ purchased_at: "2026-10-01T12:00:00+02:00", shelf_unit_price: 1.26 }),
      row({}),
    ]);
    expect(rise).toMatchObject({ product: "Coca-Cola Zero", store: "Albert Heijn", from: 1.19, to: 1.33, percent: 11.8 });
    expect(rise.fromDate).toBe("2026-09-01T12:00:00+02:00");
  });

  it("doesn't count a dearer store as a price rise", () => {
    expect(
      biggestIncreases([row({ store: "Hoogvliet", shelf_unit_price: 1.13 }), row({ shelf_unit_price: 1.33 })]),
    ).toEqual([]);
  });

  it("leaves out falls, unchanged prices, single purchases and products without a size", () => {
    expect(
      biggestIncreases([
        row({ product_id: "a", shelf_unit_price: 2 }),
        row({ product_id: "a", purchased_at: "2026-10-01T12:00:00+02:00", shelf_unit_price: 1.5 }),
        row({ product_id: "b" }),
        row({ product_id: "b", purchased_at: "2026-10-01T12:00:00+02:00" }),
        row({ product_id: "c" }),
        row({ product_id: "d", size_unit: null, shelf_unit_price: null }),
        row({ product_id: "d", size_unit: null, shelf_unit_price: null, purchased_at: "2026-10-01T12:00:00+02:00" }),
      ]),
    ).toEqual([]);
  });

  it("shows each product once, biggest rise first, up to the limit", () => {
    const later = "2026-11-01T12:00:00+01:00";
    const rises = biggestIncreases(
      [
        row({}),
        row({ purchased_at: later, shelf_unit_price: 1.25 }), // +5%
        row({ store: "Hoogvliet", shelf_unit_price: 1 }),
        row({ store: "Hoogvliet", purchased_at: later, shelf_unit_price: 1.2 }), // +20%, same product
        row({ product_id: "melk", product: "Halfvolle melk", shelf_unit_price: 1 }),
        row({ product_id: "melk", product: "Halfvolle melk", purchased_at: later, shelf_unit_price: 1.1 }), // +10%
        row({ product_id: "kaas", product: "Kaas", size_unit: "kg", shelf_unit_price: 10 }),
        row({ product_id: "kaas", product: "Kaas", size_unit: "kg", purchased_at: later, shelf_unit_price: 10.5 }), // +5%
      ],
      2,
    );
    expect(rises.map((r) => [r.product, r.store, r.percent])).toEqual([
      ["Coca-Cola Zero", "Hoogvliet", 20],
      ["Halfvolle melk", "Albert Heijn", 10],
    ]);
  });
});

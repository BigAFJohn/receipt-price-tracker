import { describe, expect, it } from "vitest";
import { formatUnitPrice, priceTicks, summarize, toPricePoints, type PriceHistoryRow } from "./price-history";

const row = (r: Partial<PriceHistoryRow>): PriceHistoryRow => ({
  line_id: crypto.randomUUID(),
  purchased_at: "2026-11-08T14:18:00+01:00",
  store: "Hoogvliet",
  quantity: 1,
  line_total: 1.79,
  discount: 0,
  shelf_unit_price: 1.1933,
  effective_unit_price: 1.1933,
  ...r,
});

describe("toPricePoints", () => {
  it("sorts oldest first and reads numbers sent as text", () => {
    const points = toPricePoints([
      row({ purchased_at: "2026-11-08T12:00:00+01:00", line_total: "3.58", discount: "0.50", quantity: "2" }),
      row({ purchased_at: "2026-10-01T12:00:00+02:00" }),
    ]);

    expect(points.map((p) => p.date)).toEqual(["2026-10-01T12:00:00+02:00", "2026-11-08T12:00:00+01:00"]);
    expect(points[1]).toMatchObject({ quantity: 2, amount: 3.08, discount: 0.5 });
    expect(points[0].time).toBe(Date.parse("2026-10-01T10:00:00Z"));
  });

  it("keeps a missing unit price missing (product without a size)", () => {
    expect(toPricePoints([row({ shelf_unit_price: null, effective_unit_price: null })])[0]).toMatchObject({
      shelf: null,
      paid: null,
    });
  });
});

describe("summarize", () => {
  it("has nothing to say without purchases", () => {
    expect(summarize([])).toBeNull();
  });

  it("finds the latest purchase, the lowest price paid and the shelf price change", () => {
    const summary = summarize(
      toPricePoints([
        row({ purchased_at: "2026-09-01T12:00:00+02:00", shelf_unit_price: 1.0, effective_unit_price: 1.0 }),
        // A Bonus week: the shelf price stays, what you paid drops
        row({ purchased_at: "2026-10-01T12:00:00+02:00", shelf_unit_price: 1.0, effective_unit_price: 0.75 }),
        row({ purchased_at: "2026-11-01T12:00:00+01:00", shelf_unit_price: 1.12, effective_unit_price: 1.12 }),
      ]),
    )!;

    expect(summary.purchases).toBe(3);
    expect(summary.latest.date).toBe("2026-11-01T12:00:00+01:00");
    expect(summary.lowestPaid?.paid).toBe(0.75);
    expect(summary.shelfChangePercent).toBe(12);
  });

  it("gives no change for a single price", () => {
    expect(summarize(toPricePoints([row({})]))!.shelfChangePercent).toBeNull();
  });

  it("names the cheapest store on average, once you've bought it at two", () => {
    const one = summarize(toPricePoints([row({ store: "Hoogvliet" }), row({ store: "Hoogvliet" })]))!;
    expect(one.cheapestStore).toBeNull();

    const two = summarize(
      toPricePoints([
        row({ store: "Albert Heijn", shelf_unit_price: 1.3 }),
        row({ store: "Albert Heijn", shelf_unit_price: 1.1 }),
        row({ store: "Hoogvliet", shelf_unit_price: 1.15 }),
      ]),
    )!;
    expect(two.cheapestStore).toEqual({ store: "Hoogvliet", averageShelf: 1.15 });
  });
});

describe("formatUnitPrice", () => {
  // Intl keeps € and the amount together with a non-breaking space.
  const plain = (text: string) => text.replace(/\u00a0/g, " ");

  it("rounds to the cent and names the unit", () => {
    expect(plain(formatUnitPrice(1.1933, "L"))).toBe("€ 1,19 per L");
    expect(plain(formatUnitPrice(2.29, "kg"))).toBe("€ 2,29 per kg");
    expect(plain(formatUnitPrice(0.48, "pcs"))).toBe("€ 0,48 per piece");
  });

  it("shows a dash when there's no unit price", () => {
    expect(formatUnitPrice(null, "L")).toBe("–");
  });
});

describe("priceTicks", () => {
  it("uses round steps around the prices", () => {
    // Prices from € 0,94 to € 1,33 per L
    expect(priceTicks(0.94, 1.33)).toEqual([0.9, 1, 1.1, 1.2, 1.3, 1.4]);
  });

  it("gives a single price some room", () => {
    expect(priceTicks(1.19, 1.19)).toEqual([1.15, 1.2, 1.25]);
  });

  it("never goes below zero", () => {
    expect(priceTicks(0.05, 0.4)[0]).toBe(0);
  });

  it("copes with bigger prices", () => {
    expect(priceTicks(8.5, 14.2)).toEqual([6, 8, 10, 12, 14, 16]);
    expect(priceTicks(2.29, 3.49)).toEqual([2, 2.5, 3, 3.5, 4]);
  });
});

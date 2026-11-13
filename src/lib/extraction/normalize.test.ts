import { describe, expect, it } from "vitest";
import {
  amsterdamToIso,
  isPlausibleDate,
  isValidTime,
  normalizeExtraction,
  normalizeSuggestion,
} from "./normalize";
import type { ExtractedReceipt } from "./schema";

describe("amsterdamToIso", () => {
  it("uses +01:00 in winter", () => {
    expect(amsterdamToIso("2026-11-08", "17:17")).toBe("2026-11-08T17:17:00+01:00");
  });

  it("uses +02:00 in summer", () => {
    expect(amsterdamToIso("2026-07-01", "09:05")).toBe("2026-07-01T09:05:00+02:00");
  });

  it("switches on the right side of the clock change (25 Oct 2026, 03:00 → 02:00)", () => {
    expect(amsterdamToIso("2026-10-24", "12:00")).toBe("2026-10-24T12:00:00+02:00");
    expect(amsterdamToIso("2026-10-26", "12:00")).toBe("2026-10-26T12:00:00+01:00");
  });

  it("uses midday when no time is printed", () => {
    expect(amsterdamToIso("2026-11-08", null)).toBe("2026-11-08T12:00:00+01:00");
  });
});

const raw: ExtractedReceipt = {
  is_receipt: true,
  store: "Albert Heijn",
  store_branch: "  Lunetten, Utrecht ",
  purchase_date: "2026-11-08",
  purchase_time: "17:17",
  total: 4.39,
  lines: [
    {
      raw_text: "BLAUWE  BES",
      sku: "",
      quantity: 1,
      is_weighed: false,
      unit_price: 4.49,
      line_total: 4.49,
      discount: -0.5,
      is_deposit: false,
      confidence: 1.2,
      product: {
        name: " Blauwe  bessen ",
        existing: false,
        brand: "AH",
        size_value: 0.125,
        size_unit: "kg",
        category: "Fruit & vegetables",
      },
    },
    {
      raw_text: "STATIEGELD",
      sku: null,
      quantity: 2,
      is_weighed: false,
      unit_price: 0.2,
      line_total: 0.4,
      discount: 0,
      is_deposit: true,
      confidence: 0.9,
      product: null,
    },
  ],
};

describe("normalizeExtraction", () => {
  const result = normalizeExtraction(raw);

  it("makes discounts positive", () => {
    expect(result.lines[0].discount).toBe(0.5);
  });

  it("keeps the town out of the store name", () => {
    expect(normalizeExtraction({ ...raw, store: "Ibrahim Nieuwegein", store_branch: "Vleescentrum Nieuwegein" }).store).toBe(
      "Ibrahim",
    );
  });

  it("tidies text and empty article numbers", () => {
    expect(result.lines[0].raw_text).toBe("BLAUWE BES");
    expect(result.lines[0].sku).toBeNull();
    expect(result.store_branch).toBe("Lunetten, Utrecht");
  });

  it("numbers the lines from 1 and keeps confidence between 0 and 1", () => {
    expect(result.lines.map((l) => l.line_no)).toEqual([1, 2]);
    expect(result.lines[0].confidence).toBe(1);
  });

  it("adds the Amsterdam time zone to the date", () => {
    expect(result.purchased_at).toBe("2026-11-08T17:17:00+01:00");
  });

  it("checks the lines against the total", () => {
    // 4.49 − 0.50 + 0.40 deposit = 4.39
    expect(result.totals_match).toBe(true);
    expect(normalizeExtraction({ ...raw, total: 9.99 }).totals_match).toBe(false);
  });
});

describe("isPlausibleDate", () => {
  const now = new Date("2026-11-11T08:00:00Z");

  it.each(["2026-11-08", "2000-01-01", "2026-11-12"])("accepts %s", (date) => {
    expect(isPlausibleDate(date, now)).toBe(true);
  });

  it.each([
    ["0000-00-00", "no date at all"],
    ["2026-02-30", "not a real day"],
    ["2026-13-01", "no 13th month"],
    ["1999-12-31", "before 2000"],
    ["2027-11-08", "a misread year in the future"],
    ["08-11-2026", "day first"],
  ])("rejects %s (%s)", (date) => {
    expect(isPlausibleDate(date, now)).toBe(false);
  });
});

describe("isValidTime", () => {
  it.each(["00:00", "17:17", "23:59"])("accepts %s", (time) => {
    expect(isValidTime(time)).toBe(true);
  });

  it.each(["24:00", "12:60", "7:05"])("rejects %s", (time) => {
    expect(isValidTime(time)).toBe(false);
  });
});

describe("normalizeExtraction with a missing or impossible date", () => {
  it.each([null, "0000-00-00", "2026-02-30"])("leaves the date empty for %s", (purchase_date) => {
    expect(normalizeExtraction({ ...raw, purchase_date }).purchased_at).toBeNull();
  });

  it("keeps the date but uses midday when the time is impossible", () => {
    expect(normalizeExtraction({ ...raw, purchase_time: "25:00" }).purchased_at).toBe("2026-11-08T12:00:00+01:00");
  });
});

describe("normalizeSuggestion", () => {
  const product = {
    name: "Coca-Cola Zero",
    existing: false,
    brand: " Coca-Cola ",
    size_value: 1.5,
    size_unit: "L" as const,
    category: "Drinks",
  };

  it("keeps a tidied suggestion", () => {
    expect(normalizeSuggestion({ is_deposit: false, product })).toEqual({ ...product, brand: "Coca-Cola" });
    expect(normalizeExtraction(raw).lines[0].suggested_product?.name).toBe("Blauwe bessen");
  });

  it("drops the size when it makes no sense", () => {
    expect(normalizeSuggestion({ is_deposit: false, product: { ...product, size_value: 0 } })).toMatchObject({
      size_value: null,
      size_unit: null,
    });
    expect(normalizeSuggestion({ is_deposit: false, product: { ...product, size_unit: null } })).toMatchObject({
      size_value: null,
    });
  });

  it("gives no product for a deposit or a blank name", () => {
    expect(normalizeSuggestion({ is_deposit: true, product })).toBeNull();
    expect(normalizeSuggestion({ is_deposit: false, product: { ...product, name: "  " } })).toBeNull();
    expect(normalizeSuggestion({ is_deposit: false, product: null })).toBeNull();
  });
});

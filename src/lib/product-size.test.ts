import { describe, expect, it } from "vitest";
import { formatSize, perUnitLabel, toInputSize, toStoredSize } from "./product-size";

describe("toStoredSize", () => {
  it.each([
    [330, "ml", 0.33, "L"],
    [1.5, "L", 1.5, "L"],
    [500, "g", 0.5, "kg"],
    [1, "kg", 1, "kg"],
    [6, "pcs", 6, "pcs"],
  ] as const)("%s %s → %s %s", (value, unit, size_value, size_unit) => {
    expect(toStoredSize(value, unit)).toEqual({ size_value, size_unit });
  });

  it("keeps three decimals, like the database", () => {
    expect(toStoredSize(1234.5678, "ml")).toEqual({ size_value: 1.235, size_unit: "L" });
  });
});

describe("toInputSize", () => {
  it("shows small sizes in ml and g", () => {
    expect(toInputSize(0.33, "L")).toEqual({ value: 330, unit: "ml" });
    expect(toInputSize(0.5, "kg")).toEqual({ value: 500, unit: "g" });
  });

  it("keeps a litre or more, and pieces, as they are", () => {
    expect(toInputSize(1.5, "L")).toEqual({ value: 1.5, unit: "L" });
    expect(toInputSize(1, "kg")).toEqual({ value: 1, unit: "kg" });
    expect(toInputSize(0.5, "pcs")).toEqual({ value: 0.5, unit: "pcs" });
  });

  it("round-trips what was typed", () => {
    for (const [value, unit] of [[330, "ml"], [750, "g"], [2, "L"], [10, "pcs"]] as const) {
      const stored = toStoredSize(value, unit);
      expect(toInputSize(stored.size_value, stored.size_unit)).toEqual({ value, unit });
    }
  });
});

describe("formatSize", () => {
  it.each([
    [1.5, "L", "1,5 L"],
    [0.33, "L", "330 ml"],
    [0.5, "kg", "500 g"],
    [6, "pcs", "6 pcs"],
  ] as const)("%s %s → %s", (value, unit, text) => {
    expect(formatSize(value, unit)).toBe(text);
  });
});

describe("perUnitLabel", () => {
  it("names the unit a price is per", () => {
    expect(perUnitLabel("L")).toBe("per L");
    expect(perUnitLabel("kg")).toBe("per kg");
    expect(perUnitLabel("pcs")).toBe("per piece");
  });
});
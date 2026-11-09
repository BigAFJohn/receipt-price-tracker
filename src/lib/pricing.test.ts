import { describe, expect, it } from "vitest";
import {
  effectiveUnitPrice,
  linesMatchTotal,
  shelfUnitPrice,
  type PricedLine,
} from "./pricing";

const cola: PricedLine = {
  quantity: 2,
  unitPrice: 1.8,
  lineTotal: 3.6,
  discount: 0,
  isDeposit: false,
};
const onePointFiveLitre = { sizeValue: 1.5, sizeUnit: "L" as const };

describe("shelfUnitPrice", () => {
  it("divides the shelf price by the pack size", () => {
    expect(shelfUnitPrice(cola, onePointFiveLitre)).toBe(1.2);
  });

  it("ignores discounts", () => {
    expect(shelfUnitPrice({ ...cola, discount: 1.8 }, onePointFiveLitre)).toBe(1.2);
  });

  it("returns null for deposit lines", () => {
    expect(shelfUnitPrice({ ...cola, isDeposit: true }, onePointFiveLitre)).toBeNull();
  });

  it("returns null when the size is missing or zero", () => {
    expect(shelfUnitPrice(cola, { sizeValue: 0, sizeUnit: "L" })).toBeNull();
  });
});

describe("effectiveUnitPrice", () => {
  it("equals the shelf unit price without a discount", () => {
    expect(effectiveUnitPrice(cola, onePointFiveLitre)).toBe(1.2);
  });

  it("applies a 1+1 gratis discount", () => {
    // 2 bottles, second free: 1.80 paid for 3 litres = 0.60 per litre
    expect(effectiveUnitPrice({ ...cola, discount: 1.8 }, onePointFiveLitre)).toBe(0.6);
  });

  it("returns null for deposit lines", () => {
    expect(effectiveUnitPrice({ ...cola, isDeposit: true }, onePointFiveLitre)).toBeNull();
  });
});

describe("linesMatchTotal", () => {
  const deposit: PricedLine = {
    quantity: 2,
    unitPrice: 0.15,
    lineTotal: 0.3,
    discount: 0,
    isDeposit: true,
  };

  it("accepts lines that add up to the total, deposits included", () => {
    expect(linesMatchTotal([cola, deposit], 3.9)).toBe(true);
  });

  it("subtracts discounts", () => {
    expect(linesMatchTotal([{ ...cola, discount: 1.8 }], 1.8)).toBe(true);
  });

  it("rejects a mismatch larger than the rounding tolerance", () => {
    expect(linesMatchTotal([cola, deposit], 4.5)).toBe(false);
  });
});

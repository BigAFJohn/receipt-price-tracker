import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { linesMatchTotal, type PricedLine } from "./pricing";

/**
 * The golden receipts are hand-checked answers for real receipts. Phase 2's
 * extraction is scored against them, so they must be right themselves:
 * every fixture's lines must add up to its printed total.
 */

type FixtureLine = {
  raw_text: string;
  quantity: number;
  sku?: string; 
  is_weighed: boolean;
  unit_price: number;
  line_total: number;
  discount: number;
  is_deposit: boolean;
};

type Fixture = {
  store: string;
  purchased_at: string;
  total: number;
  lines: FixtureLine[];
};

const dir = join(process.cwd(), "tests/fixtures/receipts");
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((file) => ({ file, data: JSON.parse(readFileSync(join(dir, file), "utf8")) as Fixture }));

const toPricedLine = (l: FixtureLine): PricedLine => ({
  quantity: l.quantity,
  unitPrice: l.unit_price,
  lineTotal: l.line_total,
  discount: l.discount,
  isDeposit: l.is_deposit,
});

describe("golden receipts", () => {
  it("has at least one fixture", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  describe.each(fixtures)("$file", ({ data }) => {
    it("lines add up to the printed total", () => {
      expect(linesMatchTotal(data.lines.map(toPricedLine), data.total)).toBe(true);
    });

    it("each line total is quantity × unit price (to the cent)", () => {
      for (const l of data.lines) {
        expect(Math.abs(l.quantity * l.unit_price - l.line_total), l.raw_text).toBeLessThanOrEqual(0.01);
      }
    });

    it("has a valid date with a time zone", () => {
      expect(Number.isNaN(Date.parse(data.purchased_at))).toBe(false);
      expect(data.purchased_at).toMatch(/[+-]\d{2}:\d{2}$|Z$/);
    });
  });
});
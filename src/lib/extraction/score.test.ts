import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { NormalizedReceipt } from "./normalize";
import { scoreExtraction, type GoldenReceipt } from "./score";

const golden = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/receipts/ah-lunetten-2026-11-08.json"), "utf8"),
) as GoldenReceipt;

/** An extraction that matches the golden receipt exactly. */
function perfect(): NormalizedReceipt {
  return {
    store: golden.store,
    store_branch: "Lunetten",
    purchased_at: golden.purchased_at,
    total: golden.total,
    totals_match: true,
    lines: golden.lines.map((l, i) => ({ ...l, line_no: i + 1, sku: l.sku ?? null, confidence: 1, suggested_product: null })),
  };
}

describe("scoreExtraction", () => {
  it("gives 100% for a perfect extraction", () => {
    expect(scoreExtraction(golden, perfect()).percent).toBe(100);
  });

  it("matches lines by text, whatever their order or letter case", () => {
    const shuffled = perfect();
    shuffled.lines.reverse();
    shuffled.lines[0].raw_text = shuffled.lines[0].raw_text.toLowerCase();

    expect(scoreExtraction(golden, shuffled).percent).toBe(100);
  });

  it("flags a discount on the wrong item", () => {
    const actual = perfect();
    actual.lines.find((l) => l.raw_text === "BLAUWE BES")!.discount = 0;

    const score = scoreExtraction(golden, actual);
    const failed = score.checks.filter((c) => !c.ok).map((c) => c.field);
    expect(failed).toEqual(["BLAUWE BES: discount"]);
  });

  it("fails every check of a missing line, and the line count", () => {
    const actual = perfect();
    actual.lines = actual.lines.filter((l) => l.raw_text !== "CHIQUITA LOS");

    const failed = scoreExtraction(golden, actual).checks.filter((c) => !c.ok);
    expect(failed.map((c) => c.field)).toContain("line count");
    expect(failed.filter((c) => c.field.startsWith("CHIQUITA LOS"))).toHaveLength(7);
  });

  it("compares purchase times to the minute", () => {
    const actual = perfect();
    actual.purchased_at = "2026-11-08T17:17:00+01:00";

    const withSeconds = { ...golden, purchased_at: "2026-11-08T17:17:54+01:00" };
    expect(scoreExtraction(withSeconds, actual).percent).toBe(100);

    const nextMinute = { ...golden, purchased_at: "2026-11-08T17:18:00+01:00" };
    expect(scoreExtraction(nextMinute, actual).checks.find((c) => c.field === "purchased_at")?.ok).toBe(false);
  });

  it("counts an extra line (e.g. a discount read as a product) as a failure", () => {
    const actual = perfect();
    actual.lines.push({ ...actual.lines[0], line_no: 99, raw_text: "BONUS AHBLAUWEBESS" });

    const failed = scoreExtraction(golden, actual).checks.filter((c) => !c.ok).map((c) => c.field);
    expect(failed).toContain("unexpected line: BONUS AHBLAUWEBESS");
  });
});

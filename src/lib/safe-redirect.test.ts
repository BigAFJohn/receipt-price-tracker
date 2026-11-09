import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps a path on this site", () => {
    expect(safeRedirectPath("/receipts/123")).toBe("/receipts/123");
  });

  it("falls back when there is no path", () => {
    expect(safeRedirectPath(null)).toBe("/receipts");
    expect(safeRedirectPath("")).toBe("/receipts");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "receipts",
  ])("rejects %s", (next) => {
    expect(safeRedirectPath(next)).toBe("/receipts");
  });
});
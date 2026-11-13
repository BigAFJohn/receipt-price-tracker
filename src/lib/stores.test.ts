import { describe, expect, it } from "vitest";
import { byUse, cleanStoreName, findStore, storeKey, withoutBranch } from "./stores";

const stores = [
  { id: "ah", name: "Albert Heijn" },
  { id: "hv", name: "Hoogvliet" },
  { id: "jumbo", name: "Jumbo" },
];

describe("storeKey", () => {
  it("ignores case, spacing and the company form", () => {
    expect(storeKey("  ALBERT   HEIJN B.V. ")).toBe("albert heijn");
    expect(storeKey("Jumbo Supermarkten BV")).toBe("jumbo supermarkten");
    expect(storeKey("Lidl Nederland GmbH")).toBe("lidl nederland");
  });
});

describe("findStore", () => {
  it.each([
    ["Albert Heijn", "ah"],
    ["ALBERT HEIJN B.V.", "ah"],
    ["AH", "ah"],
    ["ah to go", "ah"],
    ["hoogvliet", "hv"],
    ["JUMBO", "jumbo"],
  ])("finds %s", (name, id) => {
    expect(findStore(name, stores)?.id).toBe(id);
  });

  it("finds nothing for a store you don't have, or no name", () => {
    expect(findStore("Lidl", stores)).toBeNull();
    expect(findStore("  ", stores)).toBeNull();
    expect(findStore(null, stores)).toBeNull();
  });

  it("doesn't treat a longer name as the same store", () => {
    expect(findStore("Jumbo Foodmarkt", stores)).toBeNull();
  });
});

describe("cleanStoreName", () => {
  it("tidies the name as it will be saved", () => {
    expect(cleanStoreName("  Lidl   Nederland  GmbH ")).toBe("Lidl Nederland");
    expect(cleanStoreName("PLUS.")).toBe("PLUS");
    expect(cleanStoreName("x".repeat(100))).toHaveLength(80);
  });
});

describe("withoutBranch", () => {
  it("drops the town Claude added when it's in the branch it read", () => {
    expect(withoutBranch("Ibrahim Nieuwegein", "Vleescentrum Nieuwegein")).toBe("Ibrahim");
    expect(withoutBranch("Jumbo Utrecht Overvecht", "Overvecht, Utrecht")).toBe("Jumbo");
  });

  it("keeps the name when there's no branch, or the branch is something else", () => {
    expect(withoutBranch("Albert Heijn", null)).toBe("Albert Heijn");
    expect(withoutBranch("Albert Heijn", "Lunetten, Utrecht")).toBe("Albert Heijn");
  });

  it("always keeps the first word", () => {
    expect(withoutBranch("Utrecht", "Utrecht")).toBe("Utrecht");
  });
});

describe("byUse", () => {
  it("puts the stores you shop at most first, then sorts by name", () => {
    const sorted = byUse([
      { name: "Action", receipts: 1 },
      { name: "Kruidvat", receipts: 0 },
      { name: "Hoogvliet", receipts: 7 },
      { name: "Albert Heijn", receipts: 0 },
    ]);
    expect(sorted.map((s) => s.name)).toEqual(["Hoogvliet", "Action", "Albert Heijn", "Kruidvat"]);
  });
});

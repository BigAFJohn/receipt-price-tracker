import { describe, expect, it } from "vitest";
import { cleanStoreName, findStore, storeKey } from "./stores";

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

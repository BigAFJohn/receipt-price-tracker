import { describe, expect, it } from "vitest";
import { ProductInputSchema, type ProductInput } from "./product-input";

const valid: ProductInput = {
  name: "  Coca-Cola Zero ",
  brand: "",
  category_id: "00000000-0000-0000-0000-000000000001",
  size_value: 1.5,
  size_unit: "L",
};

const firstError = (input: ProductInput) => {
  const result = ProductInputSchema.safeParse(input);
  return result.success ? null : result.error.issues[0]?.message;
};

describe("ProductInputSchema", () => {
  it("tidies the name and turns an empty brand into no brand", () => {
    const result = ProductInputSchema.parse(valid);
    expect(result.name).toBe("Coca-Cola Zero");
    expect(result.brand).toBeNull();
  });

  it("allows no category", () => {
    expect(ProductInputSchema.safeParse({ ...valid, category_id: null }).success).toBe(true);
  });

  it.each([
    [{ name: "   " }, "Give the product a name"],
    [{ size_value: 0 }, "Size must be more than 0"],
    [{ size_value: Number.NaN }, "Enter the size as a number, e.g. 1.5"],
    [{ size_unit: "cl" as never }, "Choose a unit from the list"],
    [{ category_id: "drinks" }, "Choose a category from the list"],
  ])("rejects %o", (change, message) => {
    expect(firstError({ ...valid, ...change })).toBe(message);
  });
});
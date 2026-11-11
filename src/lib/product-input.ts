import { z } from "zod";
import { SIZE_UNITS } from "./product-size";

/** What the product form sends to the server. Checked again there: never trust the browser. */
export const ProductInputSchema = z.object({
  name: z.string().trim().min(1, "Give the product a name").max(120, "Keep the name under 120 characters"),
  // Empty means no brand.
  brand: z
    .string()
    .trim()
    .max(80, "Keep the brand under 80 characters")
    .transform((b) => b || null),
  // guid(): any id in Postgres's uuid format; the database checks the category exists.
  category_id: z.guid("Choose a category from the list").nullable(),
  size_value: z
    .number({ error: "Enter the size as a number, e.g. 1.5" })
    .positive("Size must be more than 0")
    .max(100_000, "That size is too big"),
  size_unit: z.enum(SIZE_UNITS, { error: "Choose a unit from the list" }),
});

export type ProductInput = z.input<typeof ProductInputSchema>;
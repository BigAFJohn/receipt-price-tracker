"use server";

import { refresh } from "next/cache";
import { ProductInputSchema, type ProductInput } from "@/lib/product-input";
import { toStoredSize } from "@/lib/product-size";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult = { error: string | null };

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Adds a product (no `productId`) or updates one. Sizes are stored in L, kg
 * or pieces, so 330 ml is saved as 0.33 L.
 */
export async function saveProduct(
  productId: string | null,
  input: ProductInput,
): Promise<ActionResult & { productId: string | null }> {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return { error: "You are signed out. Sign in and try again.", productId: null };

  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Some fields aren't valid.", productId: null };
  }
  const { size_value, size_unit, ...rest } = parsed.data;
  const row = { ...rest, ...toStoredSize(size_value, size_unit) };

  // RLS limits both to the user's own products.
  const { data, error } = productId
    ? await supabase.from("products").update(row).eq("id", productId).select("id")
    : await supabase.from("products").insert(row).select("id");

  if (error) {
    console.error("[products] save failed:", error.code, error.message);
    if (error.code === "23505") return { error: `You already have a product called "${row.name}".`, productId: null };
    return { error: "The product could not be saved. Try again.", productId: null };
  }
  if (!data?.length) return { error: "Product not found.", productId: null };

  refresh();
  return { error: null, productId: data[0].id };
}

/** Deletes a product. Receipt lines matched to it stay, unmatched. */
export async function deleteProduct(productId: string): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return { error: "You are signed out. Sign in and try again." };

  const { data, error } = await supabase.from("products").delete().eq("id", productId).select("id");
  if (error || !data?.length) {
    if (error) console.error("[products] delete failed:", error.code, error.message);
    return { error: "The product could not be deleted. Try again." };
  }

  refresh();
  return { error: null };
}
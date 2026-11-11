import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "@playwright/test";

/**
 * Seeds confirmed receipts straight into Supabase (no Claude needed), for
 * tests of pages that show receipts' data. Delete what you add afterwards.
 */

export async function signedInClient(user: { email: string; password: string }): Promise<SupabaseClient> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  expect((await supabase.auth.signInWithPassword(user)).error).toBeNull();
  return supabase;
}

export type SeedLine = {
  text: string;
  quantity?: number;
  unitPrice: number;
  discount?: number;
  isDeposit?: boolean;
  productId?: string | null;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** Intl writes amounts as "€\u00a01,33": a non-breaking space keeps € and the number together. */
export const euro = (text: string) => text.replace(/ /g, "\u00a0");

/** Adds a confirmed receipt with these lines; its total is what the lines add up to. Returns its id. */
export async function confirmReceipt(
  supabase: SupabaseClient,
  receipt: { store: string; at: string; lines: SeedLine[] },
): Promise<string> {
  const { data: store } = await supabase.from("stores").select("id").eq("name", receipt.store).single();
  const { data: draft } = await supabase.from("receipts").insert({ status: "draft" }).select("id").single();

  const lines = receipt.lines.map((l, i) => {
    const quantity = l.quantity ?? 1;
    return {
      line_no: i + 1,
      raw_text: l.text,
      sku: null,
      quantity,
      is_weighed: false,
      unit_price: l.unitPrice,
      line_total: cents(quantity * l.unitPrice),
      discount: l.discount ?? 0,
      is_deposit: l.isDeposit ?? false,
      confidence: null,
      product_id: l.productId ?? null,
    };
  });

  const { error } = await supabase.rpc("save_receipt", {
    p_receipt_id: draft!.id,
    p_store_id: store!.id,
    p_purchased_at: receipt.at,
    p_total: cents(lines.reduce((sum, l) => sum + l.line_total - l.discount, 0)),
    p_lines: lines,
    p_confirm: true,
  });
  expect(error).toBeNull();
  return draft!.id;
}

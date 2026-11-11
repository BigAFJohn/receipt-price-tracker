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
  /** Defaults to quantity × unit price. */
  lineTotal?: number;
  discount?: number;
  isDeposit?: boolean;
  productId?: string | null;
  /** Claude's suggestion, as stored when a receipt is read. */
  suggestedProduct?: {
    name: string;
    existing: boolean;
    brand: string | null;
    size_value: number | null;
    size_unit: "L" | "kg" | "pcs" | null;
    category: string | null;
  } | null;
};

type SeedReceipt = { store: string; at: string; lines: SeedLine[] };

const cents = (n: number) => Math.round(n * 100) / 100;

/** Intl writes amounts as "€\u00a01,33": a non-breaking space keeps € and the number together. */
export const euro = (text: string) => text.replace(/ /g, "\u00a0");

/** Adds a confirmed receipt with these lines; its total is what the lines add up to. Returns its id. */
export function confirmReceipt(supabase: SupabaseClient, receipt: SeedReceipt): Promise<string> {
  return seedReceipt(supabase, receipt, true);
}

/**
 * Adds a draft receipt that has already been "read", so its review page
 * shows these lines without calling Claude. Returns its id.
 */
export function draftReceipt(supabase: SupabaseClient, receipt: SeedReceipt): Promise<string> {
  return seedReceipt(supabase, receipt, false);
}

async function seedReceipt(supabase: SupabaseClient, receipt: SeedReceipt, confirm: boolean): Promise<string> {
  const { data: store } = await supabase.from("stores").select("id").eq("name", receipt.store).single();
  const { data: draft } = await supabase
    .from("receipts")
    .insert({ status: "draft", extracted_at: new Date().toISOString() })
    .select("id")
    .single();

  const lines = receipt.lines.map((l, i) => {
    const quantity = l.quantity ?? 1;
    return {
      line_no: i + 1,
      raw_text: l.text,
      sku: null,
      quantity,
      is_weighed: false,
      unit_price: l.unitPrice,
      line_total: l.lineTotal ?? cents(quantity * l.unitPrice),
      discount: l.discount ?? 0,
      is_deposit: l.isDeposit ?? false,
      confidence: null,
      product_id: l.productId ?? null,
      suggested_product: l.suggestedProduct ?? null,
    };
  });

  const { error } = await supabase.rpc("save_receipt", {
    p_receipt_id: draft!.id,
    p_store_id: store!.id,
    p_purchased_at: receipt.at,
    p_total: cents(lines.reduce((sum, l) => sum + l.line_total - l.discount, 0)),
    p_lines: lines,
    p_confirm: confirm,
  });
  expect(error).toBeNull();
  return draft!.id;
}

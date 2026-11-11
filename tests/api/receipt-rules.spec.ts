import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { testUser } from "../expected";

/**
 * Checks the database's own rules for saving receipts (the save_receipt
 * function), bypassing the app: the app checks the same rules, but the
 * database must hold even if the app has a bug.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function client() {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

const lines = [
  { line_no: 1, raw_text: "TEST ITEM A", sku: null, quantity: 1, is_weighed: false, unit_price: 1, line_total: 1, discount: 0, is_deposit: false, confidence: null },
  { line_no: 2, raw_text: "TEST ITEM B", sku: null, quantity: 1, is_weighed: false, unit_price: 2, line_total: 2, discount: 0, is_deposit: false, confidence: null },
];

const saveArgs = (receiptId: string, total: number, confirm: boolean) => ({
  p_receipt_id: receiptId,
  p_store_id: null,
  p_purchased_at: "2026-11-08T12:00:00+01:00",
  p_total: total,
  p_lines: lines,
  p_confirm: confirm,
});

test.describe("Saving receipts (database rules)", () => {
  test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  test("signed out: cannot save a receipt", async () => {
    const { error } = await client().rpc("save_receipt", saveArgs(crypto.randomUUID(), 3, false));

    expect(error).not.toBeNull();
  });

  test("signed in: confirming needs lines that add up, and a confirmed receipt is locked", async () => {
    const supabase = client();
    const { error: authError } = await supabase.auth.signInWithPassword(testUser!);
    expect(authError).toBeNull();

    const { data: draft, error: insertError } = await supabase
      .from("receipts")
      .insert({ status: "draft" })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    try {
      const status = async () =>
        (await supabase.from("receipts").select("status").eq("id", draft!.id).single()).data?.status;

      // Lines add up to 3.00, not 9.99: refused, and still a draft
      const wrong = await supabase.rpc("save_receipt", saveArgs(draft!.id, 9.99, true));
      expect(wrong.error?.code).toBe("23514");
      expect(await status()).toBe("draft");

      // Lines add up: confirmed, with both lines saved
      const right = await supabase.rpc("save_receipt", saveArgs(draft!.id, 3, true));
      expect(right.error).toBeNull();
      expect(await status()).toBe("confirmed");
      const { count } = await supabase
        .from("receipt_lines")
        .select("*", { count: "exact", head: true })
        .eq("receipt_id", draft!.id);
      expect(count).toBe(2);

      // Confirmed: can't be changed until reopened
      const locked = await supabase.rpc("save_receipt", saveArgs(draft!.id, 3, false));
      expect(locked.error?.code).toBe("P0002");
    } finally {
      await supabase.from("receipts").delete().eq("id", draft!.id);
      await supabase.auth.signOut({ scope: "local" });
    }
  });
});
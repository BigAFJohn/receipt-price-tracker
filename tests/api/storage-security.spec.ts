import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { testUser } from "../expected";

/**
 * Tries to break the storage and database rules directly against Supabase,
 * bypassing the app. Each attempt must be refused.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const OTHER_USER = "11111111-1111-1111-1111-111111111111";
const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });

function client() {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

test.describe("Storage and data rules", () => {
  test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  test("signed out: cannot upload a receipt photo", async () => {
    const { error } = await client()
      .storage.from("receipts")
      .upload(`${OTHER_USER}/${crypto.randomUUID()}.jpg`, jpeg, { contentType: "image/jpeg" });

    expect(error).not.toBeNull();
  });

  test("signed out: cannot read any receipts", async () => {
    const { data } = await client().from("receipts").select("id");

    expect(data ?? []).toHaveLength(0);
  });

  test("signed out: cannot read or add products", async () => {
    const supabase = client();
    const { data } = await supabase.from("products").select("id");
    const { error } = await supabase.from("products").insert({ name: "Sneaky product" });

    expect(data ?? []).toHaveLength(0);
    expect(error).not.toBeNull();
  });

  test("signed out: cannot read spending", async () => {
    const { data, error } = await client().from("spending_lines").select("amount");

    expect(error).not.toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test("signed in: cannot upload into another user's folder", async () => {
    const supabase = client();
    const { error: authError } = await supabase.auth.signInWithPassword(testUser!);
    expect(authError).toBeNull();

    const { error } = await supabase.storage
      .from("receipts")
      .upload(`${OTHER_USER}/${crypto.randomUUID()}.jpg`, jpeg, { contentType: "image/jpeg" });

    expect(error).not.toBeNull();
    await supabase.auth.signOut({ scope: "local" }); // don't end other tests' sessions
  });

  test("signed in: the bucket refuses non-JPEG files", async () => {
    const supabase = client();
    await supabase.auth.signInWithPassword(testUser!);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.storage
      .from("receipts")
      .upload(`${user!.id}/${crypto.randomUUID()}.jpg`, new Blob(["text"], { type: "text/plain" }), {
        contentType: "text/plain",
      });

    expect(error).not.toBeNull();
    await supabase.auth.signOut({ scope: "local" }); // don't end other tests' sessions
  });
});

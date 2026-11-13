import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { supabaseConfigured, testUser } from "../expected";

/** Who may see and change stores: the shared ones are read-only, your own are yours. */

const client = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

test.describe("Store rules", () => {
  test.skip(!supabaseConfigured, "Supabase not configured");

  test("signed out: sees the shared stores, cannot add one", async () => {
    const supabase = client();
    const { data } = await supabase.from("stores").select("name");
    const { error } = await supabase.from("stores").insert({ name: "Sneaky store" });

    expect(data?.map((s) => s.name)).toEqual(expect.arrayContaining(["Albert Heijn", "Hoogvliet"]));
    expect(error).not.toBeNull();
  });

  test("signed in: adds your own store once, and can't change the shared ones", async () => {
    test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
    const supabase = client();
    expect((await supabase.auth.signInWithPassword(testUser!)).error).toBeNull();
    const name = `Lidl test-${crypto.randomUUID().slice(0, 8)}`;

    try {
      const { data: added, error } = await supabase.from("stores").insert({ name }).select("id, name").single();
      expect(error).toBeNull();
      expect(added?.name).toBe(name);

      // The same name again, in other letters, is refused
      const again = await supabase.from("stores").insert({ name: ` ${name.toUpperCase()} ` });
      expect(again.error?.code).toBe("23505");

      // Shared stores stay as they are
      const renamed = await supabase.from("stores").update({ name: "AH" }).eq("name", "Albert Heijn").select("id");
      expect(renamed.data ?? []).toHaveLength(0);
      const deleted = await supabase.from("stores").delete().eq("name", "Hoogvliet").select("id");
      expect(deleted.data ?? []).toHaveLength(0);
    } finally {
      await supabase.from("stores").delete().eq("name", name);
      await supabase.auth.signOut({ scope: "local" }); // don't end other tests' sessions
    }
  });
});

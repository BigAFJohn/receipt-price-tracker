import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { supabaseConfigured, testUser } from "../expected";

/** Invite codes stay hidden; readings and limits can't be changed by users. */

const client = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

test.describe("Reading rules", () => {
  test.skip(!supabaseConfigured, "Supabase not configured");

  test("signed out: no invite codes, readings or limits", async () => {
    const supabase = client();
    for (const table of ["invite_codes", "readings", "reading_limits"]) {
      const { data } = await supabase.from(table).select("*");
      expect(data ?? [], table).toHaveLength(0);
    }
  });

  test("signed in: invite codes stay hidden, readings can't be removed, limits can't be raised", async () => {
    test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
    const supabase = client();
    expect((await supabase.auth.signInWithPassword(testUser!)).error).toBeNull();

    try {
      const codes = await supabase.from("invite_codes").select("code");
      expect(codes.data ?? []).toHaveLength(0);

      const removed = await supabase.from("readings").delete().gte("id", 0).select("id");
      expect(removed.error).not.toBeNull();

      const { data: me } = await supabase.auth.getUser();
      const raised = await supabase.from("reading_limits").upsert({ user_id: me.user!.id, monthly_readings: 9999 });
      expect(raised.error).not.toBeNull();
    } finally {
      await supabase.auth.signOut({ scope: "local" }); // don't end other tests' sessions
    }
  });
});

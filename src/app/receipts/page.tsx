import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import styles from "./receipts.module.css";

export const metadata: Metadata = {
  title: "Receipts · Receipt Price Tracker",
};

export default function ReceiptsPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Your receipts</h1>
      {/* Reads the session, so it streams in behind a Suspense boundary. */}
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <SignedInContent />
      </Suspense>
    </main>
  );
}

async function SignedInContent() {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  // The proxy already sends signed-out visitors to /login; this is a backstop.
  if (!user) redirect("/login?next=/receipts");

  return (
    <>
      <div className={styles.bar}>
        <p className={styles.muted} data-testid="signed-in-as">
          Signed in as {user.email}
        </p>
        <form action={signOut}>
          <button type="submit" className={styles.link}>
            Sign out
          </button>
        </form>
      </div>
      <p className={styles.empty}>Receipt upload is coming in the next feature.</p>
    </>
  );
}
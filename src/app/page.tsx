import Link from "next/link";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Receipt Price Tracker</h1>
      <p className={styles.lead}>
        Snap a receipt, see what you paid, and track prices over time.
      </p>
      <p className={styles.cta}>
        <Link href="/receipts">Go to your receipts →</Link>
      </p>
      <section className={styles.card} aria-labelledby="db-status-heading">
        <h2 id="db-status-heading">Database connection</h2>
        {/* Reads the request, so it streams in behind a Suspense boundary. */}
        <Suspense fallback={<p data-testid="db-status-loading">Checking…</p>}>
          <DatabaseStatus />
        </Suspense>
      </section>
    </main>
  );
}

async function DatabaseStatus() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <p className={styles.warn} data-testid="db-status">
        Not configured. Copy <span className={styles.code}>.env.example</span> to{" "}
        <span className={styles.code}>.env.local</span> and add your Supabase URL and anon key.
      </p>
    );
  }

  const { data, error } = await supabase.from("stores").select("name").order("name");

  if (error) {
    return (
      <p className={styles.warn} data-testid="db-status">
        Could not reach Supabase. Check the keys and that the migration has run.
      </p>
    );
  }

  return (
    <>
      <p className={styles.ok} data-testid="db-status">
        Connected. Tracking {data.length} stores:
      </p>
      <ul className={styles.stores} data-testid="store-list">
        {data.map((s) => (
          <li key={s.name}>{s.name}</li>
        ))}
      </ul>
    </>
  );
}

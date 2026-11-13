import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import { DeleteButton } from "./delete-button";
import { ReadButton } from "./read-button";
import styles from "./receipts.module.css";
import { monthName } from "@/lib/readings";
import { getAllowance } from "@/lib/supabase/readings";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = {
  title: "Receipts · Receipt Price Tracker",
};

const uploadedAt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Amsterdam",
});

const purchasedOn = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

type ListedReceipt = {
  created_at: string;
  purchased_at: string | null;
  total: number | null;
  store_branch: string | null;
  extracted_at: string | null;
  extraction: { totals_match?: boolean; store?: string } | null;
  extraction_error: string | null;
  // A single store; typed loosely because supabase-js can't tell without generated types.
  stores: { name: string } | { name: string }[] | null;
  receipt_lines: { count: number }[];
};

const storeName = (s: ListedReceipt["stores"]) => (Array.isArray(s) ? s[0]?.name : s?.name);

/** "Albert Heijn · 8 Nov, 17:17 · € 15,20 · 5 items", or the upload time before reading. */
function ReceiptSummary({ receipt: r }: { receipt: ListedReceipt }) {
  if (!r.extracted_at || r.total === null || !r.purchased_at) {
    return <span>Uploaded {uploadedAt.format(new Date(r.created_at))}</span>;
  }
  const store = storeName(r.stores) ?? r.extraction?.store ?? "Unknown store";
  const items = r.receipt_lines[0]?.count ?? 0;
  return (
    <span data-testid="receipt-summary">
      <strong>{store}</strong> · {purchasedOn.format(new Date(r.purchased_at))} · {euro.format(r.total)} ·{" "}
      {items} {items === 1 ? "item" : "items"}
    </span>
  );
}

function ExtractionStatus({ receipt: r }: { receipt: ListedReceipt }) {
  if (r.extraction_error) {
    return (
      <span className={styles.warnText} data-testid="extraction-status">
        {r.extraction_error}
      </span>
    );
  }
  if (!r.extracted_at) {
    return (
      <span className={styles.mutedText} data-testid="extraction-status">
        Not read yet
      </span>
    );
  }
  return r.extraction?.totals_match ? (
    <span className={styles.okText} data-testid="extraction-status">
      Lines add up to the total
    </span>
  ) : (
    <span className={styles.warnText} data-testid="extraction-status">
      Lines don&apos;t add up — check when reviewing
    </span>
  );
}

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
  if (!supabase || !user) redirect("/login?next=/receipts");

  const { data: receipts, error } = await supabase
    .from("receipts")
    .select(
      "id, image_path, status, created_at, purchased_at, total, store_branch, extracted_at, extraction, extraction_error, stores(name), receipt_lines(count)",
    )
    .order("created_at", { ascending: false });

  if (error) console.error("[receipts] list failed:", error.code, error.message);

  // Private bucket: photos are shown through short-lived signed links.
  const paths = (receipts ?? []).map((r) => r.image_path).filter((p): p is string => !!p);
  const { data: signed } = paths.length
    ? await supabase.storage.from("receipts").createSignedUrls(paths, 60 * 60)
    : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const readings = await getAllowance(supabase);

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

      <UploadForm userId={user.id} />
      {readings.left !== null && (
        <p className={styles.muted} data-testid="readings-left">
          {readings.left} of {readings.limit} receipt readings left in {monthName()}.
        </p>
      )}

      {error ? (
        <p className={styles.error}>Your receipts could not be loaded. Refresh to try again.</p>
      ) : receipts.length === 0 ? (
        <p className={styles.empty}>No receipts yet. Add a photo of your first one.</p>
      ) : (
        <ul className={styles.list} data-testid="receipt-list">
          {receipts.map((r) => {
            const src = r.image_path ? urlFor.get(r.image_path) : undefined;
            return (
              <li key={r.id} className={styles.item} data-testid="receipt-item" data-receipt-id={r.id}>
                <Link href={`/receipts/${r.id}`} className={styles.itemLink}>
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URLs change hourly
                    <img src={src} alt="Receipt photo" className={styles.thumb} />
                  ) : (
                    <span className={styles.thumb} aria-hidden />
                  )}
                  <div className={styles.meta}>
                    <ReceiptSummary receipt={r} />
                    <span className={styles.statusRow}>
                      <span className={r.status === "draft" ? styles.draft : styles.confirmed}>
                        {r.status === "draft" ? "Draft" : "Confirmed"}
                      </span>
                      <ExtractionStatus receipt={r} />
                    </span>
                  </div>
                </Link>
                {r.status === "draft" && (
                  <div className={styles.actions}>
                    {(!r.extracted_at || r.extraction_error) && (
                      <ReadButton receiptId={r.id} label={r.extraction_error ? "Try again" : "Read receipt"} />
                    )}
                    <DeleteButton receiptId={r.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

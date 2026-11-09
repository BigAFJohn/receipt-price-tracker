import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import { DeleteButton } from "./delete-button";
import styles from "./receipts.module.css";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = {
  title: "Receipts · Receipt Price Tracker",
};

const uploadedAt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Amsterdam",
});

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
    .select("id, image_path, status, created_at")
    .order("created_at", { ascending: false });

  if (error) console.error("[receipts] list failed:", error.code, error.message);

  // Private bucket: photos are shown through short-lived signed links.
  const paths = (receipts ?? []).map((r) => r.image_path).filter((p): p is string => !!p);
  const { data: signed } = paths.length
    ? await supabase.storage.from("receipts").createSignedUrls(paths, 60 * 60)
    : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

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

      {error ? (
        <p className={styles.error}>Your receipts could not be loaded. Refresh to try again.</p>
      ) : receipts.length === 0 ? (
        <p className={styles.empty}>No receipts yet. Add a photo of your first one.</p>
      ) : (
        <ul className={styles.list} data-testid="receipt-list">
          {receipts.map((r) => {
            const src = r.image_path ? urlFor.get(r.image_path) : undefined;
            return (
              <li key={r.id} className={styles.item} data-testid="receipt-item">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URLs change hourly
                  <img src={src} alt="Receipt photo" className={styles.thumb} />
                ) : (
                  <span className={styles.thumb} aria-hidden />
                )}
                <div className={styles.meta}>
                  <span>Uploaded {uploadedAt.format(new Date(r.created_at))}</span>
                  <span className={r.status === "draft" ? styles.draft : styles.confirmed}>
                    {r.status === "draft" ? "Draft" : "Confirmed"}
                  </span>
                </div>
                {r.status === "draft" && <DeleteButton receiptId={r.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
"use client";

import { useTransition } from "react";
import { extractReceipt } from "./actions";
import styles from "./receipts.module.css";

/** Asks Claude to read (or re-read) a draft receipt. Errors show on the receipt itself. */
export function ReadButton({ receiptId, label }: { receiptId: string; label: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={styles.link}
      disabled={pending}
      onClick={() => startTransition(async () => void (await extractReceipt(receiptId)))}
    >
      {pending ? "Reading…" : label}
    </button>
  );
}
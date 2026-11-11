"use client";

import { useTransition } from "react";
import { extractReceipt } from "./actions";
import styles from "./receipts.module.css";

/** Asks Claude to read (or re-read) a draft receipt. Errors show on the receipt itself. */
export function ReadButton({
  receiptId,
  label,
  confirmMessage,
}: {
  receiptId: string;
  label: string;
  /** Asked first when reading again would replace work, e.g. edited lines. */
  confirmMessage?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={styles.link}
      disabled={pending}
      onClick={() => {
        if (confirmMessage && !confirm(confirmMessage)) return;
        startTransition(async () => void (await extractReceipt(receiptId, { force: true })));
      }}
    >
      {pending ? "Reading…" : label}
    </button>
  );
}
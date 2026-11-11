"use client";

import { useState, useTransition } from "react";
import { reopenReceipt } from "../actions";
import styles from "./review.module.css";

/** Turns a confirmed receipt back into a draft so it can be corrected. */
export function ReopenButton({ receiptId }: { receiptId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className={styles.secondary}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await reopenReceipt(receiptId);
            setError(result.error);
          })
        }
      >
        {pending ? "Reopening…" : "Reopen for editing"}
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </>
  );
}
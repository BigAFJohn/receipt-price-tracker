"use client";

import { useTransition } from "react";
import { deleteDraftReceipt } from "./actions";
import styles from "./receipts.module.css";

export function DeleteButton({ receiptId }: { receiptId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={styles.link}
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this draft and its photo?")) return;
        startTransition(async () => {
          const result = await deleteDraftReceipt(receiptId);
          if (result.error) alert(result.error);
        });
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteDraftReceipt } from "./actions";
import styles from "./receipts.module.css";

export function DeleteButton({
  receiptId,
  label = "Delete",
  afterDelete,
}: {
  receiptId: string;
  label?: string;
  /** Where to go once deleted, e.g. back to the list from the receipt's own page. */
  afterDelete?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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
          else if (afterDelete) router.push(afterDelete);
        });
      }}
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}
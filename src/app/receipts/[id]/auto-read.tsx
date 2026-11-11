"use client";

import { useEffect, useRef, useState } from "react";
import { extractReceipt } from "../actions";
import styles from "./review.module.css";

/**
 * Starts reading a new receipt as soon as its page opens. When reading ends,
 * the server refreshes the page, which then shows the lines (or the error).
 */
export function AutoRead({ receiptId }: { receiptId: string }) {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only once, even when React runs effects twice in development.
    if (started.current) return;
    started.current = true;
    extractReceipt(receiptId).then((result) => {
      if (result.error) setError(result.error);
    });
  }, [receiptId]);

  if (error) {
    return (
      <p className={styles.warnBox} role="alert">
        {error}
      </p>
    );
  }

  return (
    <p className={styles.reading} data-testid="reading" aria-live="polite">
      Reading receipt… this takes a few seconds.
    </p>
  );
}
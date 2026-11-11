"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { fitWithin, receiptImagePath, validateReceiptFile } from "@/lib/receipt-image";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createDraftReceipt } from "./actions";
import styles from "./receipts.module.css";

/**
 * Draws the photo onto a canvas at a smaller size and re-encodes it as JPEG.
 * Keeps uploads small and drops the photo's metadata (including GPS location).
 */
async function resizeToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/jpeg", 0.85),
  );
}

type Status = { kind: "idle" } | { kind: "busy"; message: string } | { kind: "error"; message: string };

export function UploadForm({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Next.js keeps this page alive (hidden) while the receipt page is open, so
  // going Back would show "Opening…" again. Reset when the page is hidden.
  useLayoutEffect(() => {
    return () => setStatus({ kind: "idle" });
  }, []);

  async function handleFile(file: File) {
    const problem = validateReceiptFile(file);
    if (problem) {
      setStatus({ kind: "error", message: problem });
      return;
    }

    try {
      setStatus({ kind: "busy", message: "Preparing photo…" });
      const jpeg = await resizeToJpeg(file);

      setStatus({ kind: "busy", message: "Uploading…" });
      const path = receiptImagePath(userId, crypto.randomUUID());
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });

      if (uploadError) {
        console.error("[upload] storage error:", uploadError.message);
        setStatus({ kind: "error", message: "Upload failed. Check your connection and try again." });
        return;
      }

      setStatus({ kind: "busy", message: "Saving…" });
      const draft = await createDraftReceipt(path);
      if (draft.error || !draft.receiptId) {
        setStatus({ kind: "error", message: draft.error ?? "The receipt could not be saved." });
        return;
      }

      // The receipt's own page reads it and shows the result for review.
      setStatus({ kind: "busy", message: "Opening…" });
      router.push(`/receipts/${draft.receiptId}`);
    } catch (err) {
      console.error("[upload]", err);
      setStatus({ kind: "error", message: "That photo could not be read. Try another one." });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = status.kind === "busy";

  return (
    <div className={styles.upload}>
      <label className={styles.uploadButton} aria-disabled={busy}>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className={styles.fileInput}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
          aria-label="Receipt photo"
        />
        {busy ? status.message : "Add receipt photo"}
      </label>

      {status.kind === "error" && (
        <p role="alert" className={styles.error} data-testid="upload-error">
          {status.message}
        </p>
      )}
    </div>
  );
}
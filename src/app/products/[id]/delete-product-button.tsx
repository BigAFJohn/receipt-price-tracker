"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteProduct } from "../actions";
import styles from "../products.module.css";

export function DeleteProductButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      className={styles.link}
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this product? Receipt lines matched to it are kept, but become unmatched.")) return;
        startTransition(async () => {
          const result = await deleteProduct(productId);
          if (result.error) alert(result.error);
          else router.push("/products");
        });
      }}
    >
      {pending ? "Deleting…" : "Delete product"}
    </button>
  );
}
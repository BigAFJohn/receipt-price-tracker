"use client";

import { useState, useTransition } from "react";
import { SIZE_UNITS, toInputSize, toStoredSize, type SizeUnit, type StoredUnit } from "@/lib/product-size";
import { parseAmount } from "@/lib/receipt-input";
import { saveProduct } from "./actions";
import styles from "./products.module.css";

export type Category = { id: string; name: string };

export type EditableProduct = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string | null;
  size_value: number | null;
  size_unit: StoredUnit | null;
};

/** A product just added from another page, e.g. a receipt line. */
export type SavedProduct = { id: string; name: string; size_value: number; size_unit: StoredUnit };

type Fields = { name: string; brand: string; categoryId: string; size: string; unit: SizeUnit };

function initialFields(product?: Omit<EditableProduct, "id">): Fields {
  const size =
    product?.size_value && product.size_unit ? toInputSize(product.size_value, product.size_unit) : null;
  return {
    name: product?.name ?? "",
    brand: product?.brand ?? "",
    categoryId: product?.category_id ?? "",
    size: size ? String(size.value) : "1",
    unit: size?.unit ?? "pcs",
  };
}

/**
 * Adds a product, or edits one when `product` is given. `prefill` starts a new
 * product with suggested values; with `onSaved`, the new product is handed back
 * instead of the form clearing for the next one.
 */
export function ProductForm({
  categories,
  product,
  prefill,
  onSaved,
  onCancel,
}: {
  categories: Category[];
  product?: EditableProduct;
  prefill?: Omit<EditableProduct, "id">;
  onSaved?: (product: SavedProduct) => void;
  onCancel?: () => void;
}) {
  const [fields, setFields] = useState<Fields>(() => initialFields(product ?? prefill));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (change: Partial<Fields>) => setFields((f) => ({ ...f, ...change }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const size = parseAmount(fields.size) ?? Number.NaN; // NaN when it isn't a number; the server says so.
    startTransition(async () => {
      const result = await saveProduct(product?.id ?? null, {
        name: fields.name,
        brand: fields.brand,
        category_id: fields.categoryId || null,
        size_value: size,
        size_unit: fields.unit,
      });
      if (result.error || !result.productId) {
        setMessage({ kind: "error", text: result.error ?? "The product could not be saved. Try again." });
      } else if (onSaved) {
        onSaved({ id: result.productId, name: fields.name.trim(), ...toStoredSize(size, fields.unit) });
      } else if (product) {
        setMessage({ kind: "ok", text: "Saved." });
      } else {
        setMessage({ kind: "ok", text: `Added ${fields.name.trim()}.` });
        setFields(initialFields());
      }
    });
  }

  return (
    <form className={styles.form} onSubmit={submit} data-testid="product-form">
      <label className={`${styles.field} ${styles.wide}`}>
        Name
        <input
          value={fields.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Coca-Cola Zero"
          required
          maxLength={120}
        />
      </label>
      <label className={styles.field}>
        Brand (optional)
        <input value={fields.brand} onChange={(e) => set({ brand: e.target.value })} maxLength={80} />
      </label>
      <label className={styles.field}>
        Category
        <select value={fields.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        Size
        <input
          value={fields.size}
          onChange={(e) => set({ size: e.target.value })}
          inputMode="decimal"
          required
        />
      </label>
      <label className={styles.field}>
        Unit
        <select value={fields.unit} onChange={(e) => set({ unit: e.target.value as SizeUnit })}>
          {SIZE_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
      <p className={`${styles.hint} ${styles.wide}`}>
        The pack size, so prices compare per litre, kilo or piece. Loose fruit and veg sold by weight: 1 kg.
      </p>

      <div className={`${styles.formActions} ${styles.wide}`}>
        <button type="submit" className={styles.button} disabled={pending}>
          {pending ? "Saving…" : product ? "Save changes" : "Add product"}
        </button>
        {onCancel && (
          <button type="button" className={styles.link} onClick={onCancel} disabled={pending}>
            Cancel
          </button>
        )}
        {message && (
          <span
            role={message.kind === "error" ? "alert" : "status"}
            data-testid="product-message"
            className={message.kind === "error" ? styles.error : styles.ok}
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}

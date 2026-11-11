"use client";

import { useState, useTransition } from "react";
import { ProductForm, type Category, type SavedProduct } from "@/app/products/product-form";
import { lineMathMismatch, linesMatchTotal } from "@/lib/pricing";
import {
  claudesGuess,
  receiptTextKey,
  sharedProducts,
  type MatchSource,
  type SuggestedProduct,
} from "@/lib/product-matching";
import { formatSize, type StoredUnit } from "@/lib/product-size";
import { parseAmount, sumLines, type ReceiptInput } from "@/lib/receipt-input";
import { saveReceipt } from "../actions";
import styles from "./review.module.css";

/** One line as typed: numbers stay text until saving, so "2," can be typed on the way to "2,58". */
export type FormLine = {
  key: string;
  raw_text: string;
  sku: string | null;
  quantity: string;
  unit_price: string;
  line_total: string;
  discount: string;
  is_weighed: boolean;
  is_deposit: boolean;
  confidence: number | null;
  /** "" for no product. */
  product_id: string;
  suggested_product: SuggestedProduct | null;
  /** How the product was chosen, shown under the picker until you change it. */
  match: MatchSource | null;
};

export type FormState = {
  store_id: string;
  date: string;
  time: string;
  total: string;
  lines: FormLine[];
};

export type ProductOption = { id: string; name: string; size_value: number | null; size_unit: StoredUnit | null };

/** Lines Claude was less sure about are highlighted for a closer look. */
const LOW_CONFIDENCE = 0.8;

/** The picker's "New product…" choice. */
const NEW_PRODUCT = "new";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

const MATCH_NOTES: Record<MatchSource, string> = {
  remembered: "Remembered from an earlier receipt.",
  suggested: "Claude's match. Check it.",
};

const sizeOf = (p: { size_value: number | null; size_unit: StoredUnit | null }) =>
  p.size_value && p.size_unit ? formatSize(p.size_value, p.size_unit) : null;

/** "1, 2 and 4" */
const listNumbers = (numbers: number[]) =>
  numbers.length === 1 ? `${numbers[0]}` : `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;

/** quantity × price, when it doesn't make the line total: one of them was probably misread. */
function lineMathProblem(l: FormLine): string | null {
  const quantity = parseAmount(l.quantity);
  const price = parseAmount(l.unit_price);
  const total = parseAmount(l.line_total);
  if (quantity === null || price === null || total === null) return null;
  const expected = lineMathMismatch(quantity, price, total);
  if (expected === null) return null;
  return `${l.quantity} × ${euro.format(price)} = ${euro.format(expected)}, but the line total is ${euro.format(total)}. Check the quantity and price on the photo.`;
}

/** "Coca-Cola Zero · 1,5 L" */
const productLabel = (p: ProductOption) => [p.name, sizeOf(p)].filter(Boolean).join(" · ");

/** Turns the typed form into the server's input, noting which fields can't be read. */
function readForm(state: FormState): { input: ReceiptInput | null; invalid: Set<string> } {
  const invalid = new Set<string>();
  const num = (field: string, text: string) => {
    const value = parseAmount(text);
    if (value === null || value < 0) invalid.add(field);
    return value ?? 0;
  };

  const total = num("total", state.total);
  if (!state.date) invalid.add("date");
  if (!state.time) invalid.add("time");

  const lines = state.lines.map((l) => {
    if (!l.raw_text.trim()) invalid.add(`${l.key}.raw_text`);
    const quantity = num(`${l.key}.quantity`, l.quantity);
    if (quantity === 0) invalid.add(`${l.key}.quantity`);
    return {
      raw_text: l.raw_text,
      sku: l.sku,
      quantity,
      is_weighed: l.is_weighed,
      unit_price: num(`${l.key}.unit_price`, l.unit_price),
      line_total: num(`${l.key}.line_total`, l.line_total),
      discount: num(`${l.key}.discount`, l.discount),
      is_deposit: l.is_deposit,
      confidence: l.confidence,
      // A deposit is never a product.
      product_id: l.is_deposit ? null : l.product_id || null,
      suggested_product: l.suggested_product,
    };
  });

  return {
    input: invalid.size ? null : { store_id: state.store_id || null, date: state.date, time: state.time, total, lines },
    invalid,
  };
}

type Message = { kind: "error" | "saved"; text: string } | null;

export function ReviewForm(props: {
  receiptId: string;
  stores: { id: string; name: string }[];
  products: ProductOption[];
  categories: Category[];
  initial: FormState;
}) {
  const [state, setState] = useState(props.initial);
  const [products, setProducts] = useState(props.products);
  /** The line whose "new product" form is open, if any. */
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  const { input, invalid } = readForm(state);
  const lineSum = sumLines(
    state.lines.map((l) => ({ line_total: parseAmount(l.line_total) ?? 0, discount: parseAmount(l.discount) ?? 0 })),
  );
  const total = parseAmount(state.total);
  const addsUp =
    !!input &&
    input.lines.length > 0 &&
    linesMatchTotal(
      input.lines.map((l) => ({
        quantity: l.quantity,
        unitPrice: l.unit_price,
        lineTotal: l.line_total,
        discount: l.discount ?? 0,
        isDeposit: l.is_deposit,
      })),
      input.total,
    );
  const items = state.lines.filter((l) => !l.is_deposit);
  const matched = items.filter((l) => l.product_id).length;
  // Different lines linked to one product: usually a slip, worth a second look.
  const shared = [...sharedProducts(state.lines.map((l) => ({ ...l, product_id: l.product_id || null })))].map(
    ([productId, numbers]) => ({ name: products.find((p) => p.id === productId)?.name ?? "one product", numbers }),
  );

  const set = (patch: Partial<FormState>) => {
    setMessage(null);
    setState((s) => ({ ...s, ...patch }));
  };

  /** Changing quantity or price recalculates the line total; editing the total directly keeps it. */
  const setLine = (key: string, patch: Partial<FormLine>) => {
    setMessage(null);
    setState((s) => ({
      ...s,
      lines: s.lines.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if ("quantity" in patch || "unit_price" in patch) {
          const q = parseAmount(next.quantity);
          const p = parseAmount(next.unit_price);
          if (q !== null && p !== null) next.line_total = (Math.round(q * p * 100) / 100).toFixed(2);
        }
        return next;
      }),
    }));
  };

  /** A product added from a line is used for that line, and for unmatched lines with the same text. */
  const productAdded = (forKey: string, product: SavedProduct) => {
    setProducts((list) => [...list, product].sort((a, b) => a.name.localeCompare(b.name)));
    setAddingFor(null);
    setMessage(null);
    setState((s) => {
      const text = receiptTextKey(s.lines.find((l) => l.key === forKey)?.raw_text ?? "");
      return {
        ...s,
        lines: s.lines.map((l) =>
          l.key === forKey || (!l.product_id && !l.is_deposit && receiptTextKey(l.raw_text) === text)
            ? { ...l, product_id: product.id, match: null }
            : l,
        ),
      };
    });
  };

  /**
   * The new-product form starts from Claude's suggestion, or from the receipt
   * text. Something sold by weight is priced per kg, so its size is always 1 kg.
   */
  const prefillFor = (l: FormLine) => {
    const s = l.suggested_product && !l.suggested_product.existing ? l.suggested_product : null;
    return {
      name: s?.name ?? l.raw_text.trim(),
      brand: s?.brand ?? null,
      category_id: props.categories.find((c) => c.name === s?.category)?.id ?? null,
      size_value: l.is_weighed ? 1 : (s?.size_value ?? null),
      size_unit: l.is_weighed ? ("kg" as const) : (s?.size_unit ?? null),
    };
  };

  const addLine = () =>
    set({
      lines: [
        ...state.lines,
        {
          key: crypto.randomUUID(),
          raw_text: "",
          sku: null,
          quantity: "1",
          unit_price: "",
          line_total: "",
          discount: "0.00",
          is_weighed: false,
          is_deposit: false,
          confidence: null,
          product_id: "",
          suggested_product: null,
          match: null,
        },
      ],
    });

  const removeLine = (key: string) => {
    if (addingFor === key) setAddingFor(null);
    set({ lines: state.lines.filter((l) => l.key !== key) });
  };

  const submit = (confirm: boolean) => {
    if (!input) {
      setMessage({ kind: "error", text: "Fix the highlighted fields first." });
      return;
    }
    startTransition(async () => {
      // On confirm the server sends you back to your receipts.
      const result = await saveReceipt(props.receiptId, input, { confirm });
      setMessage(result.error ? { kind: "error", text: result.error } : { kind: "saved", text: "Draft saved." });
    });
  };

  const bad = (field: string) => (invalid.has(field) ? { "aria-invalid": true as const } : {});

  // A div, not a form: each line can hold a form of its own for adding a product.
  return (
    <div className={styles.form} data-testid="review-form">
      <fieldset className={styles.header} disabled={pending}>
        <label className={styles.field}>
          <span>Store</span>
          <select value={state.store_id} onChange={(e) => set({ store_id: e.target.value })}>
            <option value="">Unknown store</option>
            {props.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Date</span>
          <input type="date" value={state.date} onChange={(e) => set({ date: e.target.value })} {...bad("date")} />
        </label>
        <label className={styles.field}>
          <span>Time</span>
          <input type="time" value={state.time} onChange={(e) => set({ time: e.target.value })} {...bad("time")} />
        </label>
        <label className={styles.field}>
          <span>Total paid (€)</span>
          <input
            inputMode="decimal"
            value={state.total}
            onChange={(e) => set({ total: e.target.value })}
            {...bad("total")}
          />
        </label>
      </fieldset>

      <fieldset className={styles.lines} disabled={pending}>
        <legend>Lines</legend>
        {state.lines.length === 0 && <p className={styles.muted}>No lines yet. Add them from the photo.</p>}

        {state.lines.map((l, i) => {
          const n = i + 1;
          const unsure = l.confidence !== null && l.confidence < LOW_CONFIDENCE;
          const suggestion = l.suggested_product && !l.suggested_product.existing ? l.suggested_product : null;
          const adding = addingFor === l.key;
          // Claude's guess at one of your products: offered, never chosen for you.
          const guess = !l.product_id && !adding ? claudesGuess(l.suggested_product, products) : null;
          const mathProblem = lineMathProblem(l);
          return (
            <div key={l.key} className={`${styles.line} ${unsure ? styles.unsure : ""}`} data-testid="line-row">
              <label className={`${styles.field} ${styles.wide}`}>
                <span>
                  Item {n}
                  {unsure && <strong className={styles.unsureNote}> · check this line</strong>}
                </span>
                <input
                  aria-label={`Description, line ${n}`}
                  value={l.raw_text}
                  onChange={(e) => setLine(l.key, { raw_text: e.target.value })}
                  {...bad(`${l.key}.raw_text`)}
                />
              </label>
              <label className={styles.field}>
                <span>{l.is_weighed ? "Weight (kg)" : "Qty"}</span>
                <input
                  aria-label={`Quantity, line ${n}`}
                  inputMode="decimal"
                  value={l.quantity}
                  onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                  {...bad(`${l.key}.quantity`)}
                />
              </label>
              <label className={styles.field}>
                <span>{l.is_weighed ? "€ per kg" : "Price"}</span>
                <input
                  aria-label={`Unit price, line ${n}`}
                  inputMode="decimal"
                  value={l.unit_price}
                  onChange={(e) => setLine(l.key, { unit_price: e.target.value })}
                  {...bad(`${l.key}.unit_price`)}
                />
              </label>
              <label className={styles.field}>
                <span>Line total</span>
                <input
                  aria-label={`Line total, line ${n}`}
                  inputMode="decimal"
                  value={l.line_total}
                  onChange={(e) => setLine(l.key, { line_total: e.target.value })}
                  {...bad(`${l.key}.line_total`)}
                />
              </label>
              <label className={styles.field}>
                <span>Discount</span>
                <input
                  aria-label={`Discount, line ${n}`}
                  inputMode="decimal"
                  value={l.discount}
                  onChange={(e) => setLine(l.key, { discount: e.target.value })}
                  {...bad(`${l.key}.discount`)}
                />
              </label>

              {mathProblem && (
                <p className={styles.lineWarning} data-testid="line-math">
                  {mathProblem}
                </p>
              )}

              {!l.is_deposit && (
                <div className={styles.product} data-testid="line-product-picker">
                  <label className={styles.field}>
                    <span>Product</span>
                    <select
                      aria-label={`Product, line ${n}`}
                      value={adding ? NEW_PRODUCT : l.product_id}
                      onChange={(e) => {
                        if (e.target.value === NEW_PRODUCT) {
                          setAddingFor(l.key);
                        } else {
                          if (adding) setAddingFor(null);
                          setLine(l.key, { product_id: e.target.value, match: null });
                        }
                      }}
                    >
                      <option value="">No product (not tracked)</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {productLabel(p)}
                        </option>
                      ))}
                      <option value={NEW_PRODUCT}>New product…</option>
                    </select>
                  </label>

                  {l.product_id && l.match && !adding && (
                    <p className={styles.productNote} data-testid="product-note">
                      {MATCH_NOTES[l.match]}
                    </p>
                  )}

                  {guess && (
                    <p className={styles.productNote} data-testid="claudes-guess">
                      Claude thinks this is {guess.name}.{" "}
                      <button
                        type="button"
                        className={styles.link}
                        onClick={() => setLine(l.key, { product_id: guess.id, match: null })}
                      >
                        Use {guess.name}
                      </button>
                    </p>
                  )}

                  {!l.product_id && suggestion && !adding && (
                    <p className={styles.productNote}>
                      Claude suggests a new product:{" "}
                      <button type="button" className={styles.link} onClick={() => setAddingFor(l.key)}>
                        Add {[suggestion.name, sizeOf(suggestion)].filter(Boolean).join(", ")}
                      </button>
                    </p>
                  )}

                  {adding && (
                    <div className={styles.newProduct}>
                      <ProductForm
                        categories={props.categories}
                        prefill={prefillFor(l)}
                        onSaved={(p) => productAdded(l.key, p)}
                        onCancel={() => setAddingFor(null)}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className={styles.flags}>
                <label>
                  <input
                    type="checkbox"
                    checked={l.is_weighed}
                    onChange={(e) => setLine(l.key, { is_weighed: e.target.checked })}
                  />{" "}
                  Sold by weight
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={l.is_deposit}
                    onChange={(e) => setLine(l.key, { is_deposit: e.target.checked })}
                  />{" "}
                  Deposit
                </label>
                <button type="button" className={styles.link} onClick={() => removeLine(l.key)}>
                  Remove line {n}
                </button>
              </div>
            </div>
          );
        })}

        <button type="button" className={styles.secondary} onClick={addLine}>
          Add line
        </button>
      </fieldset>

      <p
        className={addsUp ? styles.okBox : styles.warnBox}
        data-testid="totals-check"
        aria-live="polite"
      >
        {state.lines.length === 0
          ? "Add the lines from the receipt to check them against the total."
          : addsUp
            ? `Lines add up to the total (${euro.format(input!.total)}).`
            : total === null
              ? `Lines add up to ${euro.format(lineSum)}. Enter the total paid to compare.`
              : `Lines add up to ${euro.format(lineSum)}, but the total paid is ${euro.format(total)} (difference ${euro.format(Math.abs(lineSum - total))}).`}
      </p>

      {shared.map((s) => (
        <p key={s.numbers.join()} className={styles.warnBox} data-testid="shared-products">
          Lines {listNumbers(s.numbers)} are {s.numbers.length === 2 ? "both" : "all"} linked to {s.name}, but their receipt text differs. Check each one is
          really {s.name} before confirming.
        </p>
      ))}

      {items.length > 0 && (
        <p className={styles.matchSummary} data-testid="match-summary">
          {matched} of {items.length} {items.length === 1 ? "item" : "items"} matched to a product.
          {matched < items.length && " Items without a product aren't tracked."}
        </p>
      )}

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? styles.error : styles.ok}>
          {message.text}
        </p>
      )}

      <div className={styles.buttons}>
        <button type="button" className={styles.secondary} disabled={pending} onClick={() => submit(false)}>
          Save draft
        </button>
        <button type="button" className={styles.primary} disabled={pending || !addsUp} onClick={() => submit(true)}>
          {pending ? "Saving…" : "Confirm receipt"}
        </button>
      </div>
      {!addsUp && state.lines.length > 0 && (
        <p className={styles.muted}>You can confirm once the lines add up to the total paid.</p>
      )}
    </div>
  );
}

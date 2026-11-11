"use client";

import { useState, useTransition } from "react";
import { linesMatchTotal } from "@/lib/pricing";
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
};

export type FormState = {
  store_id: string;
  date: string;
  time: string;
  total: string;
  lines: FormLine[];
};

/** Lines Claude was less sure about are highlighted for a closer look. */
const LOW_CONFIDENCE = 0.8;

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

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
    };
  });

  return {
    input: invalid.size ? null : { store_id: state.store_id || null, date: state.date, time: state.time, total, lines },
    invalid,
  };
}

type Message = { kind: "error" | "saved"; text: string } | null;

export function ReviewForm(props: { receiptId: string; stores: { id: string; name: string }[]; initial: FormState }) {
  const [state, setState] = useState(props.initial);
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
        discount: l.discount,
        isDeposit: l.is_deposit,
      })),
      input.total,
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
        },
      ],
    });

  const removeLine = (key: string) => set({ lines: state.lines.filter((l) => l.key !== key) });

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

  return (
    <form className={styles.form} data-testid="review-form" onSubmit={(e) => e.preventDefault()}>
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
    </form>
  );
}
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { receiptTextKey, type MatchSource, type SuggestedProduct } from "@/lib/product-matching";
import { formatForInput, toAmsterdamParts } from "@/lib/receipt-input";
import { findStore, NEW_STORE } from "@/lib/stores";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DeleteButton } from "../delete-button";
import { ReadButton } from "../read-button";
import { AutoRead } from "./auto-read";
import { ReopenButton } from "./reopen-button";
import { ReviewForm, type FormState, type ProductOption } from "./review-form";
import styles from "./review.module.css";

export const metadata: Metadata = {
  title: "Review receipt · Receipt Price Tracker",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const purchasedOn = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Amsterdam",
});

type LineRow = {
  line_no: number;
  raw_text: string;
  sku: string | null;
  quantity: number;
  is_weighed: boolean;
  unit_price: number;
  line_total: number;
  discount: number;
  is_deposit: boolean;
  confidence: number | null;
  product_id: string | null;
  suggested_product: SuggestedProduct | null;
  // A single product; typed loosely because supabase-js can't tell without generated types.
  products: { name: string } | { name: string }[] | null;
};

const productName = (p: LineRow["products"]) => (Array.isArray(p) ? p[0]?.name : p?.name);

export default function ReviewPage({ params }: PageProps<"/receipts/[id]">) {
  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href="/receipts">← All receipts</Link>
      </p>
      {/* The receipt id is only known at request time, so it's read inside Suspense. */}
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        {params.then(({ id }) => (
          <Review id={id} />
        ))}
      </Suspense>
    </main>
  );
}

async function Review({ id }: { id: string }) {
  if (!UUID.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  // The proxy already sends signed-out visitors to /login; this is a backstop.
  if (!supabase || !user) redirect(`/login?next=/receipts/${id}`);

  const [
    { data: receipt },
    { data: lines },
    { data: stores },
    { data: products },
    { data: categories },
  ] = await Promise.all([
    supabase
      .from("receipts")
      // store_read: the shop's name as Claude read it, for a store you don't have yet.
      .select(
        "id, status, image_path, store_id, purchased_at, total, extracted_at, extraction_error, store_read:extraction->>store",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("receipt_lines")
      .select(
        "line_no, raw_text, sku, quantity, is_weighed, unit_price, line_total, discount, is_deposit, confidence, product_id, suggested_product, products(name)",
      )
      .eq("receipt_id", id)
      .order("line_no"),
    supabase.from("stores").select("id, name").order("name"),
    supabase.from("products").select("id, name, size_value, size_unit").order("name"),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  if (!receipt) notFound();

  // What you matched before at this store, to show which lines were remembered.
  const { data: aliasRows } = receipt.store_id
    ? await supabase.from("product_aliases").select("raw_text, product_id").eq("store_id", receipt.store_id)
    : { data: [] };
  const aliases = new Map((aliasRows ?? []).map((a) => [a.raw_text as string, a.product_id as string]));

  const { data: photo } = receipt.image_path
    ? await supabase.storage.from("receipts").createSignedUrl(receipt.image_path, 60 * 60)
    : { data: null };

  const rows = (lines ?? []) as LineRow[];
  const storeList = stores ?? [];
  const reading = receipt.status === "draft" && !receipt.extracted_at && !receipt.extraction_error;

  return (
    <div className={styles.layout}>
      <figure className={styles.photo}>
        {photo?.signedUrl ? (
          <a href={photo.signedUrl} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs change hourly */}
            <img src={photo.signedUrl} alt="Receipt photo" />
          </a>
        ) : (
          <div className={styles.noPhoto}>No photo</div>
        )}
        {photo?.signedUrl && <figcaption className={styles.muted}>Tap the photo to open it full size.</figcaption>}
      </figure>

      <section className={styles.details}>
        <h1 className={styles.title}>{receipt.status === "confirmed" ? "Receipt" : "Review receipt"}</h1>

        {reading ? (
          <AutoRead receiptId={receipt.id} />
        ) : receipt.status === "confirmed" ? (
          <ConfirmedReceipt
            receiptId={receipt.id}
            store={storeList.find((s) => s.id === receipt.store_id)?.name ?? "Unknown store"}
            purchasedAt={receipt.purchased_at}
            total={Number(receipt.total)}
            lines={rows}
          />
        ) : (
          <>
            {receipt.extraction_error ? (
              <p className={styles.warnBox} role="alert" data-testid="extraction-error">
                {receipt.extraction_error} You can try again, or enter the lines yourself below.{" "}
                <ReadButton receiptId={receipt.id} label="Try again" />
              </p>
            ) : (
              <p className={styles.muted}>
                Check each line against the photo, fix anything that&apos;s wrong, then confirm.{" "}
                <ReadButton
                  receiptId={receipt.id}
                  label="Read again"
                  confirmMessage="Read the receipt again? This replaces the lines below, including your edits."
                />
              </p>
            )}

            <ReviewForm
              // A new reading replaces the lines, so start the form afresh.
              key={receipt.extracted_at ?? "unread"}
              receiptId={receipt.id}
              stores={storeList}
              products={(products ?? []) as ProductOption[]}
              categories={categories ?? []}
              initial={toFormState(receipt, rows, aliases, storeList)}
            />

            <div className={styles.dangerZone}>
              <DeleteButton receiptId={receipt.id} label="Delete draft" afterDelete="/receipts" />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * The store to start the form with: the one saved; else the store Claude read,
 * if you have it; else a new store under the name Claude read.
 */
function initialStore(storeId: string | null, storeRead: string | null, stores: { id: string; name: string }[]) {
  if (storeId) return { store_id: storeId, new_store_name: "" };
  if (!storeRead?.trim()) return { store_id: "", new_store_name: "" };
  const known = findStore(storeRead, stores);
  return known ? { store_id: known.id, new_store_name: "" } : { store_id: NEW_STORE, new_store_name: storeRead };
}

function toFormState(
  receipt: {
    store_id: string | null;
    store_read: string | null;
    purchased_at: string | null;
    total: number | null;
  },
  lines: LineRow[],
  aliases: Map<string, string>,
  stores: { id: string; name: string }[],
): FormState {
  const matchSource = (l: LineRow): MatchSource | null => {
    if (!l.product_id) return null;
    if (aliases.get(receiptTextKey(l.raw_text)) === l.product_id) return "remembered";
    return l.suggested_product?.existing ? "suggested" : null;
  };
  const when = receipt.purchased_at ? toAmsterdamParts(receipt.purchased_at) : { date: "", time: "" };
  return {
    ...initialStore(receipt.store_id, receipt.store_read, stores),
    date: when.date,
    time: when.time,
    total: receipt.total === null ? "" : formatForInput(Number(receipt.total)),
    lines: lines.map((l) => ({
      key: `line-${l.line_no}`,
      raw_text: l.raw_text,
      sku: l.sku,
      quantity: formatForInput(Number(l.quantity), 3),
      unit_price: formatForInput(Number(l.unit_price)),
      line_total: formatForInput(Number(l.line_total)),
      discount: formatForInput(Number(l.discount)),
      is_weighed: l.is_weighed,
      is_deposit: l.is_deposit,
      confidence: l.confidence === null ? null : Number(l.confidence),
      product_id: l.product_id ?? "",
      suggested_product: l.suggested_product,
      match: matchSource(l),
    })),
  };
}

function ConfirmedReceipt(props: {
  receiptId: string;
  store: string;
  purchasedAt: string | null;
  total: number;
  lines: LineRow[];
}) {
  return (
    <>
      <p data-testid="confirmed-summary">
        <strong>{props.store}</strong>
        {props.purchasedAt && <> · {purchasedOn.format(new Date(props.purchasedAt))}</>} · {euro.format(props.total)}
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className={styles.num}>
              Qty
            </th>
            <th scope="col" className={styles.num}>
              Price
            </th>
            <th scope="col" className={styles.num}>
              Paid
            </th>
          </tr>
        </thead>
        <tbody>
          {props.lines.map((l) => (
            <tr key={l.line_no}>
              <td>
                {l.raw_text}
                {l.is_deposit && <span className={styles.tag}>deposit</span>}
                {l.product_id && productName(l.products) && (
                  <Link href={`/products/${l.product_id}`} className={styles.productLink} data-testid="line-product">
                    {productName(l.products)}
                  </Link>
                )}
              </td>
              <td className={styles.num}>{l.is_weighed ? `${Number(l.quantity)} kg` : Number(l.quantity)}</td>
              <td className={styles.num}>
                {euro.format(Number(l.unit_price))}
                {l.is_weighed && "/kg"}
              </td>
              <td className={styles.num}>
                {euro.format(Number(l.line_total) - Number(l.discount))}
                {Number(l.discount) > 0 && (
                  <span className={styles.discount}> (−{euro.format(Number(l.discount))})</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ReopenButton receiptId={props.receiptId} />
    </>
  );
}

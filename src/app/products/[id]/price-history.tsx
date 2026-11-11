import { formatUnitPrice, summarize, toPricePoints, type PriceHistoryRow } from "@/lib/price-history";
import type { StoredUnit } from "@/lib/product-size";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../products.module.css";
import { PriceChart } from "./price-chart";

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });
const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const weight = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 });

/** "2×" for a count, "1,463 kg" for a weighed item. */
const quantityText = (q: number) => (Number.isInteger(q) ? `${q}×` : `${weight.format(q)} kg`);
const percent = new Intl.NumberFormat("en-GB", { signDisplay: "exceptZero", maximumFractionDigits: 1 });

/** What you paid for a product over time, from your confirmed receipts. */
export async function PriceHistory({
  productId,
  productName,
  unit,
}: {
  productId: string;
  productName: string;
  /** The product's size unit; null when it has no size, so there are no unit prices. */
  unit: StoredUnit | null;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = supabase
    ? await supabase
        .from("price_history")
        .select("line_id, purchased_at, store, quantity, line_total, discount, shelf_unit_price, effective_unit_price")
        .eq("product_id", productId)
        .order("purchased_at")
    : { data: null, error: null };

  if (error) console.error("[products] price history failed:", error.code, error.message);

  const points = toPricePoints((data ?? []) as PriceHistoryRow[]);
  const summary = summarize(points);

  if (!summary) {
    return (
      <p className={styles.empty} data-testid="price-empty">
        No purchases yet. Choose this product for a line when you review a receipt, then confirm it.
      </p>
    );
  }

  const latest = summary.latest;
  const at = (p: { store: string | null; date: string }) => [p.store, date.format(new Date(p.date))].filter(Boolean).join(", ");

  return (
    <>
      {!unit && (
        <p className={styles.hint}>Add a pack size below to compare prices per litre, kilo or piece.</p>
      )}

      {unit && (
        <dl className={styles.stats} data-testid="price-summary">
          <div>
            <dt>Latest shelf price</dt>
            <dd>{formatUnitPrice(latest.shelf, unit)}</dd>
            <dd className={styles.muted}>{at(latest)}</dd>
          </div>
          {summary.lowestPaid && (
            <div>
              <dt>Lowest you paid</dt>
              <dd>{formatUnitPrice(summary.lowestPaid.paid, unit)}</dd>
              <dd className={styles.muted}>{at(summary.lowestPaid)}</dd>
            </div>
          )}
          {summary.shelfChangePercent !== null && (
            <div>
              <dt>Shelf price change</dt>
              <dd>{percent.format(summary.shelfChangePercent)}%</dd>
              <dd className={styles.muted}>since {date.format(new Date(points[0].date))}</dd>
            </div>
          )}
          {summary.cheapestStore && (
            <div>
              <dt>Cheapest on average</dt>
              <dd>{summary.cheapestStore.store}</dd>
              <dd className={styles.muted}>{formatUnitPrice(summary.cheapestStore.averageShelf, unit)}</dd>
            </div>
          )}
        </dl>
      )}

      {unit && (
        <PriceChart
          points={points}
          unit={unit}
          label={`Price of ${productName} per ${unit === "pcs" ? "piece" : unit} over time, from ${points.length} ${points.length === 1 ? "purchase" : "purchases"}. The table below lists each one.`}
        />
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table} data-testid="price-table">
          <caption className={styles.muted}>
            {summary.purchases} {summary.purchases === 1 ? "purchase" : "purchases"}, newest first
          </caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Store</th>
              <th scope="col" className={styles.num}>
                Paid
              </th>
              {unit && (
                <>
                  <th scope="col" className={styles.num}>
                    Shelf price
                  </th>
                  <th scope="col" className={styles.num}>
                    You paid
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.lineId}>
                <td>{date.format(new Date(p.date))}</td>
                <td>{p.store ?? "Unknown store"}</td>
                <td className={styles.num}>
                  {euro.format(p.amount)}
                  {p.quantity !== 1 && <span className={styles.muted}> ({quantityText(p.quantity)})</span>}
                </td>
                {unit && (
                  <>
                    <td className={styles.num}>{formatUnitPrice(p.shelf, unit)}</td>
                    <td className={styles.num}>
                      {formatUnitPrice(p.paid, unit)}
                      {p.discount > 0 && <span className={styles.deal}> discount</span>}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

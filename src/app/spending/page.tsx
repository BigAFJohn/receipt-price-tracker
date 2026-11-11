import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { formatUnitPrice } from "@/lib/price-history";
import {
  biggestIncreases,
  monthLabel,
  NOT_MATCHED,
  spendByMonth,
  type PriceRow,
  type SpendingLine,
} from "@/lib/spending";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./spending.module.css";

export const metadata: Metadata = {
  title: "Spending · Receipt Price Tracker",
};

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });
const percent = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

/** How many months the overview shows. */
const MONTHS_SHOWN = 12;

export default function SpendingPage({ searchParams }: PageProps<"/spending">) {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Spending</h1>
      <p className={styles.muted}>From your confirmed receipts.</p>
      {/* The chosen month comes from the address, so it's read at request time, inside Suspense. */}
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        {searchParams.then(({ month }) => (
          <Spending month={typeof month === "string" ? month : null} />
        ))}
      </Suspense>
    </main>
  );
}

async function Spending({ month: chosen }: { month: string | null }) {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  // The proxy already sends signed-out visitors to /login; this is a backstop.
  if (!supabase || !user) redirect("/login?next=/spending");

  const [{ data: lines, error }, { data: prices }] = await Promise.all([
    supabase.from("spending_lines").select("month, amount, is_deposit, product_id, category"),
    supabase
      .from("price_history")
      .select("product_id, product, size_unit, store, purchased_at, shelf_unit_price"),
  ]);

  if (error) {
    console.error("[spending] failed:", error.code, error.message);
    return <p className={styles.error}>Your spending could not be loaded. Refresh to try again.</p>;
  }

  const months = spendByMonth((lines ?? []) as SpendingLine[]).slice(0, MONTHS_SHOWN);
  if (months.length === 0) {
    return (
      <p className={styles.empty} data-testid="spending-empty">
        Nothing to show yet. Confirm a receipt and its spending appears here.
      </p>
    );
  }

  const selected = months.find((m) => m.month === chosen) ?? months[0];
  const biggestMonth = Math.max(...months.map((m) => m.total));
  const biggestCategory = selected.categories[0]?.amount ?? 0;
  const rises = biggestIncreases((prices ?? []) as PriceRow[]);

  return (
    <>
      <section className={styles.section} aria-labelledby="per-month">
        <h2 id="per-month">Per month</h2>
        <ul className={styles.bars} data-testid="months">
          {months.map((m) => (
            <li key={m.month}>
              <Link
                href={`/spending?month=${m.month}`}
                className={styles.barRow}
                aria-current={m.month === selected.month ? "page" : undefined}
                scroll={false}
              >
                <span className={styles.barLabel}>{monthLabel(m.month)}</span>
                <span className={styles.barTrack}>
                  <span className={styles.bar} style={{ width: `${(m.total / biggestMonth) * 100}%` }} />
                </span>
                <span className={styles.barValue}>{euro.format(m.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.hint}>Choose a month to see it by category.</p>
      </section>

      <section className={styles.section} aria-labelledby="by-category">
        <h2 id="by-category">
          By category <span className={styles.muted}>· {monthLabel(selected.month)}</span>
        </h2>
        <ul className={styles.bars} data-testid="categories">
          {selected.categories.map((c) => (
            <li key={c.name} className={styles.barRow}>
              <span className={styles.barLabel}>{c.name}</span>
              <span className={styles.barTrack}>
                <span className={styles.bar} style={{ width: `${(c.amount / biggestCategory) * 100}%` }} />
              </span>
              <span className={styles.barValue}>
                {euro.format(c.amount)} <span className={styles.muted}>{percent.format(c.share)}%</span>
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.total} data-testid="month-total">
          Total {euro.format(selected.total)}
        </p>
        {selected.categories.some((c) => c.name === NOT_MATCHED) && (
          <p className={styles.hint}>
            “{NOT_MATCHED}” is spending on receipt lines without a product. Reopen a receipt and choose products
            for its lines to sort them into categories.
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="increases">
        <h2 id="increases">Biggest price increases</h2>
        {rises.length === 0 ? (
          <p className={styles.muted} data-testid="increases-empty">
            No price rises yet. They show once you&apos;ve bought a product more than once at the same store.
          </p>
        ) : (
          <ol className={styles.increases} data-testid="increases">
            {rises.map((r) => (
              <li key={r.productId}>
                <Link href={`/products/${r.productId}`}>
                  <strong>{r.product}</strong>
                </Link>{" "}
                <span className={styles.rise}>+{percent.format(r.percent)}%</span>
                <span className={styles.muted}>
                  {r.store}: {formatUnitPrice(r.from, r.unit)} on {shortDate.format(new Date(r.fromDate))} →{" "}
                  {formatUnitPrice(r.to, r.unit)} on {shortDate.format(new Date(r.toDate))}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className={styles.hint}>Shelf prices before discounts, compared within the same store.</p>
      </section>
    </>
  );
}

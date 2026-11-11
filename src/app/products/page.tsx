import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { formatSize, type StoredUnit } from "@/lib/product-size";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProductForm } from "./product-form";
import styles from "./products.module.css";

export const metadata: Metadata = {
  title: "Products · Receipt Price Tracker",
};

type ListedProduct = {
  id: string;
  name: string;
  brand: string | null;
  size_value: number | null;
  size_unit: StoredUnit | null;
  // A single category; typed loosely because supabase-js can't tell without generated types.
  categories: { name: string } | { name: string }[] | null;
  receipt_lines: { count: number }[];
};

const categoryName = (c: ListedProduct["categories"]) => (Array.isArray(c) ? c[0]?.name : c?.name);

/** "Coca-Cola · 1,5 L · Drinks · bought 3 times" */
function ProductSummary({ product: p }: { product: ListedProduct }) {
  const bought = p.receipt_lines[0]?.count ?? 0;
  const details = [
    p.brand,
    p.size_value && p.size_unit ? formatSize(p.size_value, p.size_unit) : null,
    categoryName(p.categories),
    bought === 0 ? "not bought yet" : `bought ${bought} ${bought === 1 ? "time" : "times"}`,
  ].filter(Boolean);
  return (
    <>
      <strong>{p.name}</strong>
      <span className={styles.muted} data-testid="product-details">
        {details.join(" · ")}
      </span>
    </>
  );
}

export default function ProductsPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Your products</h1>
      <p className={styles.muted}>
        The things you track over time. Receipt lines are matched to these, so prices compare across
        receipts and stores.
      </p>
      {/* Reads the session, so it streams in behind a Suspense boundary. */}
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <SignedInContent />
      </Suspense>
    </main>
  );
}

async function SignedInContent() {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  // The proxy already sends signed-out visitors to /login; this is a backstop.
  if (!supabase || !user) redirect("/login?next=/products");

  const [{ data: products, error }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, brand, size_value, size_unit, categories(name), receipt_lines(count)")
      .order("name"),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  if (error) console.error("[products] list failed:", error.code, error.message);

  return (
    <>
      <section className={styles.section} aria-labelledby="add-product">
        <h2 id="add-product">Add a product</h2>
        <ProductForm categories={categories ?? []} />
      </section>

      {error ? (
        <p className={styles.error}>Your products could not be loaded. Refresh to try again.</p>
      ) : products.length === 0 ? (
        <p className={styles.empty}>No products yet. Add the things you buy most often.</p>
      ) : (
        <ul className={styles.list} data-testid="product-list">
          {(products as ListedProduct[]).map((p) => (
            <li key={p.id} className={styles.item} data-product-id={p.id}>
              <Link href={`/products/${p.id}`}>
                <ProductSummary product={p} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
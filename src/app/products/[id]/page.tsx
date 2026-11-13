import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProductForm, type EditableProduct } from "../product-form";
import styles from "../products.module.css";
import { DeleteProductButton } from "./delete-product-button";
import { PriceHistory } from "./price-history";

export const metadata: Metadata = {
  title: "Product · Receipt Price Tracker",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ProductPage({ params }: PageProps<"/products/[id]">) {
  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href="/products">← All products</Link>
      </p>
      {/* The product id is only known at request time, so it's read inside Suspense. */}
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        {params.then(({ id }) => (
          <Product id={id} />
        ))}
      </Suspense>
    </main>
  );
}

async function Product({ id }: { id: string }) {
  if (!UUID.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  // The proxy already sends signed-out visitors to /login; this is a backstop.
  if (!supabase || !user) redirect(`/login?next=/products/${id}`);

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, brand, category_id, size_value, size_unit")
      .eq("id", id)
      .maybeSingle<EditableProduct>(),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  if (!product) notFound();

  return (
    <>
      <h1 className={styles.title}>{product.name}</h1>
      <section className={styles.section} aria-labelledby="price-history">
        <h2 id="price-history">Price history</h2>
        <Suspense fallback={<p className={styles.muted}>Loading prices…</p>}>
          <PriceHistory
            productId={product.id}
            productName={product.name}
            unit={product.size_unit}
            sizeValue={product.size_value === null ? null : Number(product.size_value)}
          />
        </Suspense>
      </section>
      <section className={styles.section} aria-labelledby="edit-product">
        <h2 id="edit-product">Details</h2>
        <ProductForm categories={categories ?? []} product={product} />
      </section>
      <div className={styles.dangerZone}>
        <DeleteProductButton productId={product.id} />
      </div>
    </>
  );
}

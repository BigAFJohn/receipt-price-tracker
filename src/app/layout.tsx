import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Receipt Price Tracker",
  description: "Track what you pay for groceries over time, from your paper receipts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <nav className="site-nav" aria-label="Main">
          <Link href="/" className="site-name">
            Receipt Price Tracker
          </Link>
          <Link href="/receipts">Receipts</Link>
          <Link href="/products">Products</Link>
          <Link href="/spending">Spending</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}

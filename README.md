# Receipt Price Tracker

Track what you pay for groceries and other store-bought items over time, from photos of paper receipts. Claude reads each receipt; you review it; the app tracks the price of each product per litre, kilo or piece.

Stores: Albert Heijn, Hoogvliet, Kruidvat. Single user.

**Status: Phase 1 (foundations).** The app connects to the database and lists the stores. Receipt upload arrives in Phase 2.

## Stack

| Layer | Choice |
| --- | --- |
| App + API | Next.js 16 (TypeScript, App Router) |
| Database, auth, file storage | Supabase (Postgres) |
| Receipt reading (Phase 2) | Claude API |
| Unit tests | Vitest |
| API + UI tests | Playwright |
| CI | GitHub Actions |
| Hosting | Vercel |

## Project layout

```
src/app/page.tsx              Home page (database status for now)
src/app/api/health/route.ts   GET /api/health: app + database check
src/lib/pricing.ts            Unit-price maths (shelf vs effective, totals check)
src/lib/supabase/server.ts    Supabase client for the server
supabase/migrations/          Database schema, security rules, storage bucket
supabase/seed.sql             Stores and categories
tests/api/                    Playwright API tests
tests/ui/                     Playwright UI tests
.github/workflows/ci.yml      Lint, type check, tests and build on every push
```

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com). Pick an EU region.
2. In the **SQL Editor**, run `supabase/migrations/20261109000000_init.sql`, then `supabase/seed.sql`.
3. Under **Authentication**, add one user (your email and a password) and turn off new sign-ups, so you are the only user.
4. Under **Project Settings → API**, copy the project URL and the `anon` public key.

### 2. Run locally

```bash
npm ci
cp .env.example .env.local   # then paste the URL and anon key
npm run dev                  # http://localhost:3000
```

The home page should say **Connected** and list the three stores.

### 3. Tests

```bash
npm run test:unit                   # Vitest
npm run build && npm run test:e2e   # Playwright API + UI tests
```

The Playwright tests read `.env.local`. With keys set, they check the real store list; without keys, they check the "not configured" path. CI runs without secrets, so pull requests from forks of this public repo never see them.

To test a deployed copy instead of a local server:

```bash
BASE_URL=https://your-app.vercel.app npm run test:e2e
```

### 4. GitHub

Create a public repository, then:

```bash
git init
git add .
git commit -m "Phase 1: foundations"
git branch -M main
git remote add origin https://github.com/<you>/receipt-price-tracker.git
git push -u origin main
```

CI runs on every push to `main` and on pull requests.

### 5. Vercel

Import the GitHub repository at [vercel.com](https://vercel.com), add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as environment variables, and deploy. Every push to `main` deploys again.

### 6. Anthropic API key (needed from Phase 2)

Create a key in the [Anthropic Console](https://console.anthropic.com), set a monthly spend limit, and add it as `ANTHROPIC_API_KEY` in `.env.local` and in Vercel. It is server-side only; never give it a `NEXT_PUBLIC_` prefix.

## Sample receipts

Put 2–3 receipt photos from each store in `samples/` for developing the Phase 2 extraction. That folder is in `.gitignore`: real receipts carry personal data (Bonuskaart number, card details) and this repo is public.

## Security notes

- Keys live in `.env.local` and Vercel settings only; `.env*` files are git-ignored except `.env.example`.
- The anon key is public by design. Row level security limits every receipt, line, product and alias to the signed-in owner; stores and categories are read-only to anyone else.
- Receipt photos go to a private storage bucket, in a folder per user.

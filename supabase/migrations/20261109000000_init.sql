-- Receipt Price Tracker: initial schema
-- Run in the Supabase SQL editor, or with `supabase db push` if you use the Supabase CLI.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table public.stores (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- e.g. "Albert Heijn"
  chain       text,                          -- optional grouping
  city        text,
  created_at  timestamptz not null default now()
);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- A normalized product you track over time (e.g. "Coca-Cola Zero 1.5 L").
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  brand        text,
  category_id  uuid references public.categories (id) on delete set null,
  size_value   numeric(10,3) check (size_value is null or size_value > 0),
  size_unit    text check (size_unit in ('L', 'kg', 'pcs')),
  created_at   timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- Receipts
-- ---------------------------------------------------------------------------

create table public.receipts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store_id      uuid references public.stores (id) on delete set null,
  purchased_at  timestamptz not null,
  total         numeric(10,2) not null check (total >= 0),
  image_path    text,                          -- path in the "receipts" storage bucket
  status        text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at    timestamptz not null default now()
);

create index receipts_user_purchased_idx on public.receipts (user_id, purchased_at desc);

-- One row per printed line on the receipt.
create table public.receipt_lines (
  id           uuid primary key default gen_random_uuid(),
  receipt_id   uuid not null references public.receipts (id) on delete cascade,
  line_no      integer not null,
  raw_text     text not null,                  -- exactly as printed, e.g. "AH COLA ZERO 1,5L"
  quantity     numeric(10,3) not null default 1 check (quantity > 0),
  unit_price   numeric(10,2) not null,         -- shelf price per item, before discount
  line_total   numeric(10,2) not null,
  discount     numeric(10,2) not null default 0 check (discount >= 0),
  is_deposit   boolean not null default false, -- statiegeld
  confidence   numeric(3,2) check (confidence between 0 and 1),
  product_id   uuid references public.products (id) on delete set null,
  unique (receipt_id, line_no)
);

create index receipt_lines_product_idx on public.receipt_lines (product_id);

-- Remembers "this receipt text at this store = this product".
create table public.product_aliases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store_id    uuid not null references public.stores (id) on delete cascade,
  raw_text    text not null,
  product_id  uuid not null references public.products (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, store_id, raw_text)
);

-- ---------------------------------------------------------------------------
-- Price history: one row per confirmed, non-deposit line matched to a product.
-- shelf_unit_price ignores discounts; effective_unit_price is what you paid.
-- ---------------------------------------------------------------------------

create view public.price_history
with (security_invoker = true) as
select
  rl.id                                   as line_id,
  r.user_id,
  r.purchased_at,
  s.name                                  as store,
  p.id                                    as product_id,
  p.name                                  as product,
  p.size_unit,
  rl.quantity,
  rl.unit_price,
  rl.line_total,
  rl.discount,
  round(rl.unit_price / nullif(p.size_value, 0), 4)
                                          as shelf_unit_price,
  round((rl.line_total - rl.discount) / nullif(rl.quantity * p.size_value, 0), 4)
                                          as effective_unit_price
from public.receipt_lines rl
join public.receipts r on r.id = rl.receipt_id
join public.products p on p.id = rl.product_id
left join public.stores s on s.id = r.store_id
where r.status = 'confirmed'
  and rl.is_deposit = false;

-- ---------------------------------------------------------------------------
-- Row level security (single user, but the repo is public: never rely on
-- obscurity — every personal row is locked to its owner).
-- ---------------------------------------------------------------------------

alter table public.stores          enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.receipts        enable row level security;
alter table public.receipt_lines   enable row level security;
alter table public.product_aliases enable row level security;

-- Stores and categories are harmless reference data: readable by anyone,
-- changeable only by a signed-in user.
create policy "read stores"        on public.stores     for select using (true);
create policy "write stores"       on public.stores     for all to authenticated using (true) with check (true);
create policy "read categories"    on public.categories for select using (true);
create policy "write categories"   on public.categories for all to authenticated using (true) with check (true);

create policy "own products" on public.products
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own receipts" on public.receipts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own receipt lines" on public.receipt_lines
  for all to authenticated
  using (exists (select 1 from public.receipts r where r.id = receipt_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.receipts r where r.id = receipt_id and r.user_id = auth.uid()));

create policy "own aliases" on public.product_aliases
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Private storage bucket for receipt photos. Files go under "<user id>/...".
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "own receipt images" on storage.objects
  for all to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

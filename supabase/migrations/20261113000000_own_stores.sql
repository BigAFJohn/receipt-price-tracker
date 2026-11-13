-- Any store, not just four: the seeded stores stay as a shared starting list,
-- and stores Claude reads on your receipts (Jumbo, Lidl, …) become your own.
-- A store is a chain; the branch stays on each receipt (store_branch).

-- Owner: null = a shared store everyone can see, otherwise the user who added it.
-- Added without a default first, so the existing (seeded) stores stay shared.
alter table public.stores add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.stores alter column user_id set default auth.uid();

alter table public.stores
  add constraint stores_name_length check (char_length(btrim(name)) between 1 and 80);

-- Names were unique across everyone; now unique per owner, ignoring case,
-- so "jumbo" can't be added twice. The app also matches your new store
-- against the shared ones before adding it.
alter table public.stores drop constraint if exists stores_name_key;
create unique index if not exists stores_owner_name_key
  on public.stores (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));

-- Everyone reads the shared stores and their own; only your own can be changed.
drop policy if exists "read stores" on public.stores;
drop policy if exists "write stores" on public.stores;
create policy "read shared and own stores" on public.stores
  for select using (user_id is null or user_id = auth.uid());
create policy "add own stores" on public.stores
  for insert to authenticated with check (user_id = auth.uid());
create policy "change own stores" on public.stores
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own stores" on public.stores
  for delete to authenticated using (user_id = auth.uid());

-- Ready for receipts from abroad (step 2): every receipt so far is Dutch and in euros.
alter table public.receipts
  add column if not exists country  text not null default 'NL' check (country ~ '^[A-Z]{2}$'),
  add column if not exists currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$');

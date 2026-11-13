-- Sign-up for invited users, and a monthly limit on Claude readings, since
-- every reading is paid from the app owner's Anthropic account.

-- ---------------------------------------------------------------------------
-- Invite codes. Managed in the SQL editor only: no one can read or change
-- them through the API (row level security on, no policies).
--   insert into public.invite_codes (code, note, max_uses) values ('ZOMER-2026', 'friends', 10);
--   update public.invite_codes set active = false where code = 'ZOMER-2026';
-- ---------------------------------------------------------------------------
create table if not exists public.invite_codes (
  code       text primary key check (char_length(code) between 6 and 64),
  note       text,
  max_uses   integer check (max_uses is null or max_uses > 0),  -- null = no maximum
  uses       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;
revoke all on public.invite_codes from anon, authenticated;
grant select, update on public.invite_codes to supabase_auth_admin;
-- Row level security applies to Supabase Auth too: without this, the hook below
-- would see no codes and turn everyone away.
create policy "auth checks invite codes" on public.invite_codes
  for all to supabase_auth_admin using (true) with check (true);

-- Runs inside Supabase Auth just before an account is created (set it up under
-- Authentication → Hooks → "Before User Created" → Postgres → this function).
-- The app sends the code as user metadata; without a valid one, nobody is
-- created, also when someone calls the sign-up API directly.
create or replace function public.hook_check_invite_code(event jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(event -> 'user' -> 'user_metadata' ->> 'invite_code', '')));
begin
  update invite_codes
     set uses = uses + 1
   where upper(code) = v_code
     and active
     and (max_uses is null or uses < max_uses);

  if found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object('message', 'That invite code isn''t valid.', 'http_code', 403)
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
revoke execute on function public.hook_check_invite_code(jsonb) from public, anon, authenticated;
grant execute on function public.hook_check_invite_code(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Readings: one row each time Claude reads a receipt, so the monthly count
-- survives deleting receipts. Users see and add their own; nobody deletes.
-- ---------------------------------------------------------------------------
create table if not exists public.readings (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  receipt_id uuid references public.receipts (id) on delete set null,
  read_at    timestamptz not null default now()
);

create index if not exists readings_user_read_at on public.readings (user_id, read_at);

alter table public.readings enable row level security;
create policy "read own readings" on public.readings
  for select to authenticated using (user_id = auth.uid());
create policy "add own readings" on public.readings
  for insert to authenticated with check (user_id = auth.uid());
revoke update, delete on public.readings from authenticated;

-- ---------------------------------------------------------------------------
-- Per-user limits. Users without a row get the app's default (20 a month).
-- monthly_readings null = no limit: for the owner and the test account.
--   insert into public.reading_limits (user_id, monthly_readings)
--   select id, null from auth.users where email = 'you@example.com';
-- ---------------------------------------------------------------------------
create table if not exists public.reading_limits (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  monthly_readings integer check (monthly_readings is null or monthly_readings >= 0)
);

alter table public.reading_limits enable row level security;
create policy "read own limit" on public.reading_limits
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.reading_limits from authenticated;

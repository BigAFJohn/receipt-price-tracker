-- Spending: one row per line of a confirmed receipt, with the month it was
-- bought (on an Amsterdam calendar) and the category of its product, if any.
-- The app adds these up per month and category. Deposits are included, so a
-- month's lines add up to the receipts' totals.

create or replace view public.spending_lines
with (security_invoker = true) as
select
  rl.id                                                        as line_id,
  r.user_id,
  r.id                                                         as receipt_id,
  r.purchased_at,
  to_char(r.purchased_at at time zone 'Europe/Amsterdam', 'YYYY-MM') as month,
  round(rl.line_total - rl.discount, 2)                        as amount,
  rl.is_deposit,
  rl.product_id,
  c.name                                                       as category
from public.receipt_lines rl
join public.receipts r on r.id = rl.receipt_id
left join public.products p on p.id = rl.product_id
left join public.categories c on c.id = p.category_id
where r.status = 'confirmed';

-- Read-only; row level security on the tables underneath limits it to your own receipts.
revoke all on public.spending_lines from anon;
grant select on public.spending_lines to authenticated;

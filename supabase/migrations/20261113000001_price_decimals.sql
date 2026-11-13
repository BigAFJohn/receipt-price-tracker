-- Fuel is priced to a tenth of a cent (€ 2,449 per litre). Prices per item
-- were kept to the cent, so € 2,449 became € 2,45 and quantity × price no
-- longer made the line total. Line totals, discounts and receipt totals stay
-- in cents: that is what is paid.

-- price_history reads unit_price, so it's set aside while the column changes.
drop view if exists public.price_history;

alter table public.receipt_lines alter column unit_price type numeric(10,3);

-- Unchanged from 20261109000000_init.sql.
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

grant select on public.price_history to authenticated, service_role;

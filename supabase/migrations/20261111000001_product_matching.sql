-- Product matching: each receipt line can point at one of your products, and
-- confirming a receipt remembers "this text at this store = this product" so
-- the next receipt from that store is matched automatically.

-- Claude's suggestion for a line ({ name, existing, brand, size_value,
-- size_unit, category }), kept so the review screen can offer it again.
alter table public.receipt_lines add column if not exists suggested_product jsonb;

-- How receipt text is compared: "  ah cola  zero " and "AH COLA ZERO" are the same line.
create or replace function public.receipt_text_key(p_text text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(trim(p_text), '\s+', ' ', 'g'));
$$;

-- Saves a reviewed receipt in one transaction: its header fields and all its
-- lines (with their products), and optionally confirms it. Confirming also
-- remembers each line's product for this store.
--
-- security invoker: runs as the signed-in user, so row level security still
-- limits it to their own receipts, products and aliases.
create or replace function public.save_receipt(
  p_receipt_id   uuid,
  p_store_id     uuid,
  p_purchased_at timestamptz,
  p_total        numeric,
  p_lines        jsonb,
  p_confirm      boolean
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sum   numeric;
  v_count integer;
begin
  update receipts
     set store_id = p_store_id,
         purchased_at = p_purchased_at,
         total = p_total
   where id = p_receipt_id
     and status = 'draft';

  if not found then
    raise exception 'receipt not found or not a draft' using errcode = 'P0002';
  end if;

  -- Only your own products: the products table's RLS hides everyone else's.
  if exists (
    select 1
      from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as l(product_id uuid)
     where l.product_id is not null
       and not exists (select 1 from products p where p.id = l.product_id)
  ) then
    raise exception 'unknown product' using errcode = '23503';
  end if;

  delete from receipt_lines where receipt_id = p_receipt_id;

  insert into receipt_lines
    (receipt_id, line_no, raw_text, sku, quantity, is_weighed,
     unit_price, line_total, discount, is_deposit, confidence, product_id, suggested_product)
  select p_receipt_id, l.line_no, l.raw_text, l.sku, l.quantity, coalesce(l.is_weighed, false),
         l.unit_price, l.line_total, coalesce(l.discount, 0), coalesce(l.is_deposit, false), l.confidence,
         -- A deposit is never a product.
         case when coalesce(l.is_deposit, false) then null else l.product_id end,
         l.suggested_product
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as l(
           line_no integer, raw_text text, sku text, quantity numeric, is_weighed boolean,
           unit_price numeric, line_total numeric, discount numeric, is_deposit boolean, confidence numeric,
           product_id uuid, suggested_product jsonb);

  if p_confirm then
    select coalesce(sum(line_total - discount), 0), count(*)
      into v_sum, v_count
      from receipt_lines
     where receipt_id = p_receipt_id;

    if v_count = 0 then
      raise exception 'a receipt needs at least one line' using errcode = '23514';
    end if;

    -- Same rule as the app: within one cent per line, for rounding on the receipt.
    if abs(v_sum - p_total) > 0.01 * greatest(1, v_count) then
      raise exception 'lines add up to % but the total is %', v_sum, p_total using errcode = '23514';
    end if;

    update receipts set status = 'confirmed' where id = p_receipt_id;

    -- Remember the matches for next time. The same text twice on one receipt
    -- counts once (the last line wins); a changed match replaces the old one.
    if p_store_id is not null then
      insert into product_aliases (store_id, raw_text, product_id)
      select distinct on (receipt_text_key(raw_text))
             p_store_id, receipt_text_key(raw_text), product_id
        from receipt_lines
       where receipt_id = p_receipt_id
         and product_id is not null
       order by receipt_text_key(raw_text), line_no desc
      on conflict (user_id, store_id, raw_text) do update set product_id = excluded.product_id;
    end if;
  end if;
end;
$$;

revoke execute on function public.save_receipt(uuid, uuid, timestamptz, numeric, jsonb, boolean) from public, anon;
grant execute on function public.save_receipt(uuid, uuid, timestamptz, numeric, jsonb, boolean) to authenticated;

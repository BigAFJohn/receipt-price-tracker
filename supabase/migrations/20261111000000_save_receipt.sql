-- Saves a reviewed receipt in one transaction: its header fields and all its
-- lines, and optionally confirms it. Doing this in the database means a failed
-- save can never leave a receipt with half its lines.
--
-- security invoker: runs as the signed-in user, so row level security still
-- limits it to their own receipts.

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

  delete from receipt_lines where receipt_id = p_receipt_id;

  insert into receipt_lines
    (receipt_id, line_no, raw_text, sku, quantity, is_weighed,
     unit_price, line_total, discount, is_deposit, confidence)
  select p_receipt_id, l.line_no, l.raw_text, l.sku, l.quantity, coalesce(l.is_weighed, false),
         l.unit_price, l.line_total, coalesce(l.discount, 0), coalesce(l.is_deposit, false), l.confidence
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as l(
           line_no integer, raw_text text, sku text, quantity numeric, is_weighed boolean,
           unit_price numeric, line_total numeric, discount numeric, is_deposit boolean, confidence numeric);

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
  end if;
end;
$$;

revoke execute on function public.save_receipt(uuid, uuid, timestamptz, numeric, jsonb, boolean) from public, anon;
grant execute on function public.save_receipt(uuid, uuid, timestamptz, numeric, jsonb, boolean) to authenticated;
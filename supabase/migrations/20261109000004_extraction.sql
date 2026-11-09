-- Fields filled in when Claude reads a receipt.

alter table public.receipts
  add column store_branch     text,
  add column extracted_at     timestamptz,
  add column extraction       jsonb,        -- model, token usage, totals check, Claude's raw answer
  add column extraction_error text;         -- why the last read failed, shown in the list

alter table public.receipt_lines
  add column is_weighed boolean not null default false,
  add column sku        text;              -- article number, when the receipt prints one
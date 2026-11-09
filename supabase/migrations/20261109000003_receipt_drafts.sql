-- A receipt is saved as a draft as soon as its photo is uploaded, before
-- Claude has read the date and total. Those two fields are therefore only
-- required once a receipt is confirmed.

alter table public.receipts
  alter column purchased_at drop not null,
  alter column total drop not null;

alter table public.receipts
  add constraint receipts_confirmed_complete
  check (status = 'draft' or (purchased_at is not null and total is not null));

-- The receipts list is ordered by upload time.
create index receipts_user_created_idx on public.receipts (user_id, created_at desc);

-- Only resized JPEGs from the app, at most 5 MB, may go into the bucket.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg']
where id = 'receipts';
-- Add Action to the stores you track.
insert into public.stores (name) values ('Action')
on conflict (name) do nothing;
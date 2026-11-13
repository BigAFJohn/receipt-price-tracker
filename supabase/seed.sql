-- Seed data: the stores you shop at and the product categories.
-- Safe to run more than once.

-- Shared stores (no owner); skipped when one with that name exists.
insert into public.stores (name, user_id)
select v.name, null
from (values ('Albert Heijn'), ('Hoogvliet'), ('Kruidvat'), ('Action')) as v (name)
where not exists (
  select 1 from public.stores s where s.user_id is null and lower(s.name) = lower(v.name)
);

insert into public.categories (name) values
  ('Drinks'),
  ('Dairy & eggs'),
  ('Bread & bakery'),
  ('Fruit & vegetables'),
  ('Meat & fish'),
  ('Pantry'),
  ('Frozen'),
  ('Snacks & sweets'),
  ('Household & cleaning'),
  ('Personal care'),
  ('Health & pharmacy'),
  ('Baby & kids'),
  ('Other')
on conflict (name) do nothing;

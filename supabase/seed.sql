-- Seed data: the stores you shop at and the product categories.
-- Safe to run more than once.

insert into public.stores (name) values
  ('Albert Heijn'),
  ('Hoogvliet'),
  ('Kruidvat')
on conflict (name) do nothing;

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

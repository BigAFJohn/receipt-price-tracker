grant usage on schema public to anon, authenticated, service_role;
grant select on public.stores, public.categories to anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
-- Kas ką mato: kiekvienam vaidmeniui parodo, kiek eilučių jis realiai
-- nuskaito per RLS. Lyginti su SPEC §1 teisių matrica.
--
-- Paleisti:
--   docker exec -i supabase_db_bravotools psql -U postgres -d postgres \
--     < scripts/who-sees-what.sql
--
-- Skaityti taip: kiekviena eilutė = vienas vaidmuo; skaičius = kiek jis
-- mato. Paskutinė eilutė (ADMIN) = tikroji suma be RLS, t. y. lubos.

begin;

create temporary table _who (
  eile int,
  vaidmuo text, epastas text,
  irankiai bigint, irankiu_kainos bigint,
  uzsakymai bigint, poreikiai bigint, pristatymai bigint,
  tiekejai bigint, tiekeju_kainos bigint,
  demesio_korteles bigint, ai_zurnalas bigint, tiekeju_saskaitos bigint
);

do $$
declare
  u record;
  c record;
  n int := 0;
begin
  for u in
    select au.email, m.role, au.id
    from memberships m
    join auth.users au on au.id = m.user_id
    order by case m.role
      when 'owner' then 1 when 'admin' then 2 when 'supply_manager' then 3
      when 'site_manager' then 4 when 'driver' then 5 else 6 end, au.email
  loop
    n := n + 1;

    -- persijungiam į vartotoją ir surenkam skaičius
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', u.id, 'role', 'authenticated')::text, true);

    select
      (select count(*) from tools) as irankiai,
      (select count(*) from tools where purchase_price is not null) as kainos,
      (select count(*) from orders) as uzsakymai,
      (select count(*) from material_requests) as poreikiai,
      (select count(*) from delivery_tasks) as pristatymai,
      (select count(*) from vendors) as tiekejai,
      (select count(*) from vendor_catalog_items) as kainynas,
      (select count(*) from attention_cards) as demesio,
      (select count(*) from ai_runs) as ai,
      (select count(*) from vendor_invoices) as saskaitos
    into c;

    -- grįžtam į postgres, kad galėtume rašyti į ataskaitą
    perform set_config('role', 'postgres', true);

    insert into _who values (n, u.role, u.email, c.irankiai, c.kainos,
      c.uzsakymai, c.poreikiai, c.pristatymai, c.tiekejai, c.kainynas,
      c.demesio, c.ai, c.saskaitos);
  end loop;

  insert into _who
  select 99, 'ADMIN (be RLS)', '—',
    (select count(*) from tools),
    (select count(*) from tools where purchase_price is not null),
    (select count(*) from orders),
    (select count(*) from material_requests),
    (select count(*) from delivery_tasks),
    (select count(*) from vendors),
    (select count(*) from vendor_catalog_items),
    (select count(*) from attention_cards),
    (select count(*) from ai_runs),
    (select count(*) from vendor_invoices);
end $$;

select vaidmuo, epastas, irankiai, irankiu_kainos, uzsakymai, poreikiai,
       pristatymai, tiekejai, tiekeju_kainos, demesio_korteles,
       ai_zurnalas, tiekeju_saskaitos
from _who order by eile;

rollback;

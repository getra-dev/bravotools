-- Test: 0035 RLS sutvirtinimas. Kiekvienas blokas atitinka realiai
-- reprodukuotą ataką (auditas 2026-08-03) — jei politika kada nors
-- atsilaisvins, testas kris būtent ties ta ataka.
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('b0b00000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@t28.local', now(), now()),
  ('b0b00000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t28.local', now(), now()),
  ('b0b00000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'driver@t28.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"b0b00000-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t28_ctx as
  select create_organization('T28 Hardening Org') as org_id;

do $$
declare org uuid;
begin
  select org_id into org from t28_ctx;
  perform invite_member(org, 'worker@t28.local', 'worker');
  perform invite_member(org, 'driver@t28.local', 'driver');
  perform create_location(org, '{"name":"T28 Objektas","type":"site"}'::jsonb);
  perform create_vendor(org, jsonb_build_object('name', 'T28 Tiekejas'));
end $$;

reset role;
create temporary table t28_fix as
  select null::uuid as order_id, null::uuid as tool_id, null::uuid as task_id;

do $$
declare org uuid; site uuid; vend uuid; oid uuid; tid uuid; task uuid;
begin
  select org_id into org from t28_ctx;
  select id into site from locations where org_id = org and type = 'site' limit 1;
  select id into vend from vendors where org_id = org limit 1;

  insert into orders (org_id, order_number, site_id, vendor_id, status, requested_by)
  values (org, 'BT-T28-0001', site, vend, 'approved',
          'b0b00000-0000-0000-0000-00000000000a')
  returning id into oid;

  insert into tools (org_id, name, purchase_price)
  values (org, 'T28 Perforatorius', 1234.56) returning id into tid;

  insert into delivery_tasks (org_id, order_id, pickup_location_id, dropoff_location_id, status)
  values (org, oid, site, site, 'assigned') returning id into task;

  update t28_fix set order_id = oid, tool_id = tid, task_id = task;
end $$;
grant select on t28_ctx, t28_fix to authenticated;

-- ============ ATAKOS DARBININKO TEISĖMIS ============
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"b0b00000-0000-0000-0000-00000000000b","role":"authenticated"}';

-- 1) eilutės įsprausimas į užsakymą (buvo: leido be jokio patikrinimo)
do $$
declare oid uuid;
begin
  select order_id into oid from t28_fix;
  begin
    perform add_line_to_order(oid, null, null, null, 'ATAKA', 999, 'vnt', null, null, null);
    raise exception 'FAIL: worker injected an order line';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- 2) tiesioginis rašymas į tools (buvo: FOR ALL politika leido)
do $$
declare tid uuid;
begin
  select tool_id into tid from t28_fix;

  update tools set purchase_price = 99999.99 where id = tid;
  if found then raise exception 'FAIL: worker updated a tool directly'; end if;

  delete from tools where id = tid;
  if found then raise exception 'FAIL: worker deleted a tool directly'; end if;

  begin
    insert into tools (org_id, name) values ((select org_id from t28_ctx), 'PADIRBTAS');
    raise exception 'FAIL: worker inserted a tool directly';
  exception when insufficient_privilege then null;
    when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

-- 3) pristatymo įrodymo klastojimas (buvo: bet kuris narys galėjo)
do $$
declare task uuid;
begin
  select task_id into task from t28_fix;
  begin
    perform mark_delivery(jsonb_build_object(
      'task_id', task, 'status', 'delivered', 'photo_path', 'klastote.jpg'));
    raise exception 'FAIL: worker forged proof of delivery';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- 4) pinigų duomenys per audito žurnalą (buvo: matė visus org įrašus)
do $$
declare org uuid; svetimi bigint;
begin
  select org_id into org from t28_ctx;
  select count(*) into svetimi from activity_log
  where org_id = org and actor_id <> 'b0b00000-0000-0000-0000-00000000000b';
  if svetimi > 0 then
    raise exception 'FAIL: worker reads % activity_log rows of other actors', svetimi;
  end if;
end $$;

-- 5) tiekėjų kainos ir kainų istorija
do $$
begin
  if (select count(*) from vendor_catalog_items) > 0 then
    raise exception 'FAIL: worker reads vendor prices';
  end if;
  if (select count(*) from material_price_points) > 0 then
    raise exception 'FAIL: worker reads price history';
  end if;
  if (select count(*) from vendor_invoices) > 0 then
    raise exception 'FAIL: worker reads vendor invoices';
  end if;
end $$;

-- ============ TEISĖTI KELIAI TURI VEIKTI ============
-- priskirtas vairuotojas gali pažymėti savo pristatymą
reset role;
do $$
declare task uuid;
begin
  select task_id into task from t28_fix;
  update delivery_tasks set assigned_to = 'b0b00000-0000-0000-0000-00000000000c'
  where id = task;
end $$;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"b0b00000-0000-0000-0000-00000000000c","role":"authenticated"}';
do $$
declare task uuid;
begin
  select task_id into task from t28_fix;
  perform mark_delivery(jsonb_build_object('task_id', task, 'status', 'delivered'));
  if (select status from delivery_tasks where id = task) <> 'delivered' then
    raise exception 'FAIL: assigned driver could not mark delivery';
  end if;
end $$;

-- tiekimas mato tai, ką turi matyti (anksčiau sąskaitos grąžindavo 0 net savininkui)
set local request.jwt.claims =
  '{"sub":"b0b00000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare org uuid; oid uuid;
begin
  select org_id into org from t28_ctx;
  select order_id into oid from t28_fix;

  -- tiekimas gali įsprausti eilutę teisėtai
  perform add_line_to_order(oid, null, null, null, 'Teiseta eilute', 5, 'vnt', null, null, null);
  if (select count(*) from order_items where order_id = oid) <> 1 then
    raise exception 'FAIL: supply cannot add an order line';
  end if;

  -- ir mato pinigų sluoksnį (politika egzistuoja, o ne tyliai grąžina 0)
  if not exists (select 1 from pg_policies
                 where tablename = 'vendor_invoices' and cmd = 'SELECT') then
    raise exception 'FAIL: vendor_invoices has no select policy';
  end if;
end $$;

-- ============ 0036: priskirti galima tik vairuotoją ============
do $$
declare task uuid; org uuid;
begin
  select task_id into task from t28_fix;
  select org_id into org from t28_ctx;
  -- darbininkas nėra vairuotojas — priskyrimas turi lūžti
  begin
    perform assign_delivery(jsonb_build_object(
      'task_id', task, 'driver_id', 'b0b00000-0000-0000-0000-00000000000b'));
    raise exception 'FAIL: a non-driver was assigned as driver';
  exception when others then
    if sqlerrm not like '%not_a_driver%' then raise; end if;
  end;
  -- tikras vairuotojas priskiriamas be klaidų
  perform assign_delivery(jsonb_build_object(
    'task_id', task, 'driver_id', 'b0b00000-0000-0000-0000-00000000000c'));
  if (select assigned_to from delivery_tasks where id = task)
     <> 'b0b00000-0000-0000-0000-00000000000c' then
    raise exception 'FAIL: real driver was not assigned';
  end if;
end $$;

-- ============ SARGAS: RLS be politikų ============
-- Būtent ši klaida jau kartą tyliai paslėpė duomenis nuo visų.
do $$
declare be_politiku text;
begin
  select string_agg(t.tablename, ', ') into be_politiku
  from pg_tables t
  where t.schemaname = 'public' and t.rowsecurity
    and t.tablename not in ('admin_access_log', 'platform_admins')  -- platformos lentelės
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = t.tablename);
  if be_politiku is not null then
    raise exception 'FAIL: RLS enabled but no policy on: %', be_politiku;
  end if;
end $$;

reset role;
rollback;

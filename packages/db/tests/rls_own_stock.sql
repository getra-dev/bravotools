-- Test: E2 own stock (0023).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('a1a1a1a1-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@t8.local', now(), now()),
  ('a1a1a1a1-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t8.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"a1a1a1a1-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t8 as select create_organization('T8 Stock Org') as org_id;

do $$
declare org uuid;
begin
  select org_id into org from t8;
  perform invite_member(org, 'worker@t8.local', 'worker');
  perform create_material(org, 'Gruntas 10l', 'vnt', 'gruntai', 'stock');
  perform create_location(org, '{"name":"Kauno sandelis","type":"warehouse"}'::jsonb);
end $$;

-- worker cannot adjust stock
set local request.jwt.claims =
  '{"sub":"a1a1a1a1-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare org uuid; mid uuid; loc uuid;
begin
  select org_id into org from t8;
  select id into mid from materials where org_id = org limit 1;
  select id into loc from locations where org_id = org limit 1;
  begin
    perform adjust_stock(jsonb_build_object(
      'material_id', mid, 'location_id', loc, 'movement_type', 'receipt', 'quantity', '5'));
    raise exception 'FAIL: worker adjusted stock';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- supply: receipt, issue, over-issue guard, adjustment
set local request.jwt.claims =
  '{"sub":"a1a1a1a1-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare org uuid; mid uuid; loc uuid; res jsonb;
begin
  select org_id into org from t8;
  select id into mid from materials where org_id = org limit 1;
  select id into loc from locations where org_id = org limit 1;

  -- receive 20
  select adjust_stock(jsonb_build_object(
    'material_id', mid, 'location_id', loc, 'movement_type', 'receipt', 'quantity', '20')) into res;
  if (res->>'balance')::numeric <> 20 then raise exception 'FAIL: receipt balance %', res->>'balance'; end if;

  -- issue 8 → 12
  select adjust_stock(jsonb_build_object(
    'material_id', mid, 'location_id', loc, 'movement_type', 'issue', 'quantity', '8')) into res;
  if (res->>'balance')::numeric <> 12 then raise exception 'FAIL: issue balance %', res->>'balance'; end if;

  -- cannot issue more than on hand
  begin
    perform adjust_stock(jsonb_build_object(
      'material_id', mid, 'location_id', loc, 'movement_type', 'issue', 'quantity', '100'));
    raise exception 'FAIL: over-issue allowed';
  exception when others then
    if sqlerrm not like '%insufficient_stock%' then raise; end if;
  end;

  -- adjustment sets exact to 15
  select adjust_stock(jsonb_build_object(
    'material_id', mid, 'location_id', loc, 'movement_type', 'adjustment', 'quantity', '15')) into res;
  if (res->>'balance')::numeric <> 15 then raise exception 'FAIL: adjustment balance %', res->>'balance'; end if;

  -- one stock row, four ledger movements (receipt, issue, adjustment) = 3 succeeded
  if (select count(*) from stock_items where org_id = org and material_id = mid) <> 1 then
    raise exception 'FAIL: stock row not single';
  end if;
  if (select count(*) from stock_movements where org_id = org) <> 3 then
    raise exception 'FAIL: ledger count wrong';
  end if;
end $$;

reset role;
rollback;

-- Test: E2 material catalog + vendor prices (0021).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('f0f0f0f0-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@t7.local', now(), now()),
  ('f0f0f0f0-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t7.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f0f0f0f0-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t7 as select create_organization('T7 Catalog Org') as org_id;

do $$
declare org uuid; mid uuid; vid uuid;
begin
  select org_id into org from t7;
  perform invite_member(org, 'worker@t7.local', 'worker');
  select create_material(org, 'Cementas CEM II 25kg', 'vnt', 'rišikliai', 'stock') into mid;
  select create_vendor(org, jsonb_build_object('name', 'Betono Tiekejas', 'email', 'b@bt.lt')) into vid;
end $$;

-- worker cannot set a price
set local request.jwt.claims =
  '{"sub":"f0f0f0f0-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare org uuid; mid uuid; vid uuid;
begin
  select org_id into org from t7;
  select id into mid from materials where org_id = org limit 1;
  select id into vid from vendors where org_id = org limit 1;
  begin
    perform set_vendor_price(jsonb_build_object('material_id', mid, 'vendor_id', vid, 'price', '5'));
    raise exception 'FAIL: worker set a price';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- supply sets + updates a price, history accumulates
set local request.jwt.claims =
  '{"sub":"f0f0f0f0-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare org uuid; mid uuid; vid uuid;
begin
  select org_id into org from t7;
  select id into mid from materials where org_id = org limit 1;
  select id into vid from vendors where org_id = org limit 1;

  -- negative price rejected
  begin
    perform set_vendor_price(jsonb_build_object('material_id', mid, 'vendor_id', vid, 'price', '-1'));
    raise exception 'FAIL: negative price allowed';
  exception when others then
    if sqlerrm not like '%invalid_price%' then raise; end if;
  end;

  perform set_vendor_price(jsonb_build_object('material_id', mid, 'vendor_id', vid, 'price', '4.20'));
  perform set_vendor_price(jsonb_build_object('material_id', mid, 'vendor_id', vid, 'price', '4.55'));

  -- one current catalog row (upsert), two history points
  if (select count(*) from vendor_catalog_items where vendor_id = vid and material_id = mid) <> 1 then
    raise exception 'FAIL: catalog not upserted to single row';
  end if;
  if (select price from vendor_catalog_items where vendor_id = vid and material_id = mid) <> 4.55 then
    raise exception 'FAIL: current price wrong';
  end if;
  if (select count(*) from material_price_points where material_id = mid) <> 2 then
    raise exception 'FAIL: price history not recorded';
  end if;

  -- update the dictionary entry
  perform update_material(mid, jsonb_build_object('canonical_name', 'Cementas CEM II 25kg (pilkas)', 'category', 'rišikliai'));
  if (select canonical_name from materials where id = mid) not like '%pilkas%' then
    raise exception 'FAIL: material not updated';
  end if;
  if (select supply_mode from materials where id = mid) <> 'stock' then
    raise exception 'FAIL: supply_mode default create wrong';
  end if;
  perform update_material(mid, jsonb_build_object('canonical_name', 'Cementas CEM II 25kg (pilkas)', 'supply_mode', 'order'));
  if (select supply_mode from materials where id = mid) <> 'order' then
    raise exception 'FAIL: supply_mode not updated';
  end if;
end $$;

-- order from a request auto-fills unit_price from the vendor catalog
do $$
declare
  org uuid; mid uuid; vid uuid; site uuid; rid uuid; item uuid; res jsonb;
begin
  select org_id into org from t7;
  select id into mid from materials where org_id = org limit 1;
  select id into vid from vendors where org_id = org limit 1;
  select create_location(org, '{"name":"T7 Objektas","type":"site"}'::jsonb) into site;

  select create_material_request(jsonb_build_object(
    'site_id', site,
    'items', jsonb_build_array(jsonb_build_object('raw_text', 'cemento 30', 'qty', '30')))) into rid;
  select id into item from material_request_items where request_id = rid limit 1;
  perform confirm_material_match(item, mid, 30, 'vnt');

  select create_order_from_request(rid, vid) into res;
  if (select unit_price from order_items where order_id = (res->>'order_id')::uuid) <> 4.55 then
    raise exception 'FAIL: unit_price not auto-filled from catalog';
  end if;
end $$;

reset role;
rollback;

-- Test: E2 greedy vehicle suggestion (0029).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('c9c9c9c9-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@te.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"c9c9c9c9-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table te as select create_organization('TE Suggest Org') as org_id;
create temporary table te_task as select null::uuid as task_id;
grant select on te_task to authenticated;

do $$
declare
  org uuid; mid uuid; vid uuid; site uuid; rid uuid; item uuid; ores jsonb; tsk uuid;
  small uuid; big uuid;
begin
  select org_id into org from te;
  -- material: 50 kg/unit, needs pallets
  select create_material(org, 'Sunki medžiaga', 'vnt', 'x', 'order') into mid;
  perform update_material(mid, jsonb_build_object('canonical_name', 'Sunki medžiaga',
    'unit_weight_kg', '50', 'units_per_pallet', '10', 'max_length_m', '1.2'));
  select create_vendor(org, jsonb_build_object('name','V','email','v@v.lt')) into vid;
  select create_location(org, '{"name":"TE Objektas","type":"site"}'::jsonb) into site;

  -- two vehicles: a small van (800 kg) and a big truck (5000 kg), both available
  select create_vehicle(org, jsonb_build_object('name','Mažas furgonas','type','van','capacity_kg','800')) into small;
  select create_vehicle(org, jsonb_build_object('name','Didelis sunkvežimis','type','truck','capacity_kg','5000')) into big;

  -- order 40 units = 2000 kg → the van (800) does NOT fit, the truck (5000) does
  select create_material_request(jsonb_build_object('site_id', site,
    'items', jsonb_build_array(jsonb_build_object('raw_text','x 40','qty','40')))) into rid;
  select id into item from material_request_items where request_id = rid limit 1;
  perform confirm_material_match(item, mid, 40, 'vnt');
  select create_order_from_request(rid, vid) into ores;

  select plan_delivery(jsonb_build_object('order_id', (ores->>'order_id')::uuid)) into tsk;
  update te_task set task_id = tsk;

  declare res jsonb;
  begin
    select suggest_delivery_vehicle(tsk) into res;
    if (res->>'weight_kg')::numeric <> 2000 then
      raise exception 'FAIL: weight sum wrong (%)', res->>'weight_kg';
    end if;
    if (res->>'pallets')::numeric <> 4 then  -- ceil(40/10)
      raise exception 'FAIL: pallet count wrong (%)', res->>'pallets';
    end if;
    -- 2000 kg must skip the 800 kg van and suggest the 5000 kg truck
    if (res->>'vehicle_id')::uuid <> big then
      raise exception 'FAIL: wrong vehicle suggested';
    end if;
    if (res->>'load_pct')::int <> 40 then  -- 2000/5000
      raise exception 'FAIL: load pct wrong (%)', res->>'load_pct';
    end if;
  end;
end $$;

reset role;
rollback;

-- Test: E2 logistics (0027).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('e5e5e5e5-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@tc.local', now(), now()),
  ('e5e5e5e5-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'driver@tc.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"e5e5e5e5-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table tc as select create_organization('TC Logistics Org') as org_id;
create temporary table tc_ids as select null::uuid as veh, null::uuid as task, null::uuid as trip;

do $$
declare org uuid; mid uuid; vid uuid; site uuid; rid uuid; item uuid; l_veh uuid; ores jsonb; oid uuid;
begin
  select org_id into org from tc;
  perform invite_member(org, 'driver@tc.local', 'worker');
  -- material with weight so the estimate is non-zero
  select create_material(org, 'Cementas 25kg', 'vnt', 'rišikliai', 'stock') into mid;
  update materials set unit_weight_kg = 25 where id = mid;
  select create_vendor(org, jsonb_build_object('name','V','email','v@v.lt')) into vid;
  select create_location(org, '{"name":"TC Objektas","type":"site"}'::jsonb) into site;

  select create_material_request(jsonb_build_object('site_id', site,
    'items', jsonb_build_array(jsonb_build_object('raw_text','cemento 40','qty','40')))) into rid;
  select id into item from material_request_items where request_id = rid limit 1;
  perform confirm_material_match(item, mid, 40, 'vnt');
  select create_order_from_request(rid, vid) into ores;

  -- worker cannot create a vehicle
  perform set_config('request.jwt.claims',
    '{"sub":"e5e5e5e5-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  begin
    perform create_vehicle(org, jsonb_build_object('name','Blocked'));
    raise exception 'FAIL: worker made a vehicle';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
  perform set_config('request.jwt.claims',
    '{"sub":"e5e5e5e5-0000-0000-0000-00000000000a","role":"authenticated"}', true);

  select create_vehicle(org, jsonb_build_object('name','Sunkvežimis','type','truck',
    'capacity_kg','5000','capacity_m3','25')) into l_veh;
  update tc_ids set veh = l_veh;

  -- plan the delivery: weight = 40 × 25 = 1000 kg
  declare l_tsk uuid;
  begin
    select plan_delivery(jsonb_build_object('order_id', (ores->>'order_id')::uuid)) into l_tsk;
    update tc_ids set task = l_tsk;
    if (select est_weight_kg from delivery_tasks where id = l_tsk) <> 1000 then
      raise exception 'FAIL: weight estimate wrong (%)',
        (select est_weight_kg from delivery_tasks where id = l_tsk);
    end if;
    if (select dropoff_location_id from delivery_tasks where id = l_tsk) <> site then
      raise exception 'FAIL: dropoff not the site';
    end if;

    -- planning twice is blocked
    begin
      perform plan_delivery(jsonb_build_object('order_id', (ores->>'order_id')::uuid));
      raise exception 'FAIL: double-planned';
    exception when others then
      if sqlerrm not like '%already_planned%' then raise; end if;
    end;

    perform assign_delivery(jsonb_build_object('task_id', l_tsk, 'vehicle_id', l_veh,
      'driver_id', 'e5e5e5e5-0000-0000-0000-00000000000b',
      'scheduled_date', current_date::text));
    if (select vehicle_id from delivery_tasks where id = l_tsk) <> l_veh then
      raise exception 'FAIL: not assigned to vehicle';
    end if;
  end;
end $$;

-- driver runs the trip + marks delivered
set local request.jwt.claims =
  '{"sub":"e5e5e5e5-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare l_veh uuid; l_tsk uuid; trip uuid;
begin
  select veh, task into l_veh, l_tsk from tc_ids;

  select start_trip(jsonb_build_object('vehicle_id', l_veh, 'odometer_start','100000')) into trip;
  if (select status from vehicles where id = l_veh) <> 'in_use' then
    raise exception 'FAIL: vehicle not in_use';
  end if;

  perform mark_delivery(jsonb_build_object('task_id', l_tsk, 'status','picked_up', 'trip_id', trip));
  perform mark_delivery(jsonb_build_object('task_id', l_tsk, 'status','delivered', 'trip_id', trip));
  if (select status from delivery_tasks where id = l_tsk) <> 'delivered' then
    raise exception 'FAIL: task not delivered';
  end if;
  if (select delivered_at from delivery_tasks where id = l_tsk) is null then
    raise exception 'FAIL: delivered_at not set';
  end if;

  perform end_trip(jsonb_build_object('trip_id', trip, 'odometer_end','100042'));
  if (select km_total from vehicle_trips where id = trip) <> 42 then
    raise exception 'FAIL: km_total wrong';
  end if;
  if (select status from vehicles where id = l_veh) <> 'available' then
    raise exception 'FAIL: vehicle not freed';
  end if;
end $$;

reset role;
rollback;

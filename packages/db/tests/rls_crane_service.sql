-- Test: E2 crane service (0031).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('caca0000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@tf.local', now(), now()),
  ('caca0000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@tf.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"caca0000-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table tf as select create_organization('TF Crane Org') as org_id;
create temporary table tf_task as select null::uuid as task_id;
grant select on tf_task to authenticated;

do $$
declare
  org uuid; mid uuid; vid uuid; site uuid; rid uuid; item uuid; ores jsonb; tsk uuid;
  van uuid; crane uuid; res jsonb;
begin
  select org_id into org from tf;
  perform invite_member(org, 'worker@tf.local', 'worker');
  select create_material(org, 'Blokeliai', 'vnt', 'mūras', 'order') into mid;
  perform update_material(mid, jsonb_build_object('canonical_name','Blokeliai','unit_weight_kg','20'));
  select create_vendor(org, jsonb_build_object('name','V','email','v@v.lt')) into vid;
  select create_location(org, '{"name":"TF Objektas","type":"site"}'::jsonb) into site;

  -- a plain van (no crane) and a crane truck, both able to carry the load
  select create_vehicle(org, jsonb_build_object('name','Furgonas','type','van','capacity_kg','5000')) into van;
  select create_vehicle(org, jsonb_build_object('name','Fiskaras','type','crane_truck','capacity_kg','5000','has_crane','true')) into crane;

  select create_material_request(jsonb_build_object('site_id', site,
    'items', jsonb_build_array(jsonb_build_object('raw_text','blok 10','qty','10')))) into rid;
  select id into item from material_request_items where request_id = rid limit 1;
  perform confirm_material_match(item, mid, 10, 'vnt');
  select create_order_from_request(rid, vid) into ores;
  select plan_delivery(jsonb_build_object('order_id', (ores->>'order_id')::uuid)) into tsk;
  update tf_task set task_id = tsk;

  -- before crane: van (smaller? equal here) may be suggested; set crane service
  perform set_delivery_crane(jsonb_build_object('task_id', tsk, 'requires_crane', true,
    'lift_height_m', '8', 'est_minutes', '45', 'billable', true));

  if (select requires_crane from delivery_tasks where id = tsk) is not true then
    raise exception 'FAIL: crane flag not set';
  end if;
  if (select crane_lift_height_m from delivery_tasks where id = tsk) <> 8 then
    raise exception 'FAIL: lift height not stored';
  end if;
  if (select est_crane_minutes from delivery_tasks where id = tsk) <> 45 then
    raise exception 'FAIL: crane minutes not stored';
  end if;
  if (select crane_billable from delivery_tasks where id = tsk) is not true then
    raise exception 'FAIL: billable not set';
  end if;

  -- suggestion must now pick the crane truck (van filtered out)
  select suggest_delivery_vehicle(tsk) into res;
  if (res->>'needs_crane')::boolean is not true then
    raise exception 'FAIL: suggestion missing crane flag';
  end if;
  if (res->>'vehicle_id')::uuid <> crane then
    raise exception 'FAIL: non-crane vehicle suggested for a crane job';
  end if;

  -- turning crane off clears the params
  perform set_delivery_crane(jsonb_build_object('task_id', tsk, 'requires_crane', false));
  if (select crane_lift_height_m from delivery_tasks where id = tsk) is not null then
    raise exception 'FAIL: height not cleared when crane off';
  end if;
end $$;

-- worker cannot set crane service
set local request.jwt.claims =
  '{"sub":"caca0000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare tsk uuid;
begin
  select task_id into tsk from tf_task;
  begin
    perform set_delivery_crane(jsonb_build_object('task_id', tsk, 'requires_crane', true));
    raise exception 'FAIL: worker set crane';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

reset role;
rollback;

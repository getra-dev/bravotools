-- Test: E2 hired / external transport (0032).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('daaa0000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@tg.local', now(), now()),
  ('daaa0000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@tg.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"daaa0000-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table tg as select create_organization('TG Hired Org') as org_id;
create temporary table tg_task as select null::uuid as task_id, null::uuid as carrier;
grant select on tg_task to authenticated;

do $$
declare
  org uuid; mid uuid; vid uuid; site uuid; rid uuid; item uuid; ores jsonb; tsk uuid;
  veh uuid; l_carrier uuid;
begin
  select org_id into org from tg;
  perform invite_member(org, 'worker@tg.local', 'worker');
  select create_material(org, 'M', 'vnt', 'x', 'order') into mid;
  select create_vendor(org, jsonb_build_object('name','Prekių tiekėjas','email','v@v.lt')) into vid;
  select create_vendor(org, jsonb_build_object('name','Vežėjas UAB','email','c@c.lt',
    'type', jsonb_build_array('transport'))) into l_carrier;
  select create_location(org, '{"name":"TG Objektas","type":"site"}'::jsonb) into site;

  select create_material_request(jsonb_build_object('site_id', site,
    'items', jsonb_build_array(jsonb_build_object('raw_text','m 5','qty','5')))) into rid;
  select id into item from material_request_items where request_id = rid limit 1;
  perform confirm_material_match(item, mid, 5, 'vnt');
  select create_order_from_request(rid, vid) into ores;
  select plan_delivery(jsonb_build_object('order_id', (ores->>'order_id')::uuid)) into tsk;
  select create_vehicle(org, jsonb_build_object('name','Van','type','van','capacity_kg','1000')) into veh;
  perform assign_delivery(jsonb_build_object('task_id', tsk, 'vehicle_id', veh));
  update tg_task set task_id = tsk, carrier = l_carrier;

  -- hired without a carrier is rejected
  begin
    perform set_delivery_method(jsonb_build_object('task_id', tsk, 'method', 'hired'));
    raise exception 'FAIL: hired without carrier allowed';
  exception when others then
    if sqlerrm not like '%carrier_required%' then raise; end if;
  end;

  -- hire the carrier with a cost → vehicle cleared, carrier + cost stored
  perform set_delivery_method(jsonb_build_object('task_id', tsk, 'method', 'hired',
    'carrier_vendor_id', l_carrier, 'cost', '120'));
  if (select delivery_method from delivery_tasks where id = tsk) <> 'hired' then
    raise exception 'FAIL: method not hired';
  end if;
  if (select carrier_vendor_id from delivery_tasks where id = tsk) <> l_carrier then
    raise exception 'FAIL: carrier not stored';
  end if;
  if (select transport_cost from delivery_tasks where id = tsk) <> 120 then
    raise exception 'FAIL: cost not stored';
  end if;
  if (select vehicle_id from delivery_tasks where id = tsk) is not null then
    raise exception 'FAIL: own vehicle not cleared when hired';
  end if;

  -- transport order proof row
  perform record_transport_sent(jsonb_build_object('task_id', tsk,
    'to_address', 'c@c.lt', 'subject', 'Transporto užsakymas'));
  if (select count(*) from outbound_messages
      where entity_type = 'delivery_task' and entity_id = tsk and status = 'sent') <> 1 then
    raise exception 'FAIL: transport proof row missing';
  end if;

  -- back to vendor_delivers clears carrier
  perform set_delivery_method(jsonb_build_object('task_id', tsk, 'method', 'vendor_delivers'));
  if (select carrier_vendor_id from delivery_tasks where id = tsk) is not null then
    raise exception 'FAIL: carrier not cleared for vendor_delivers';
  end if;
end $$;

-- worker cannot change the method
set local request.jwt.claims =
  '{"sub":"daaa0000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare tsk uuid; c uuid;
begin
  select task_id, carrier into tsk, c from tg_task;
  begin
    perform set_delivery_method(jsonb_build_object('task_id', tsk, 'method', 'hired', 'carrier_vendor_id', c));
    raise exception 'FAIL: worker set method';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

reset role;
rollback;

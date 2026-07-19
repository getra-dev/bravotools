-- =====================================================
-- 0027 — Etapas 2 (SPEC 3.4 be AI): logistics & fleet.
-- Turn an order into a delivery task (weight/volume est
-- from the material fields), assign it to a vehicle + driver
-- + date, run a trip with odometer, and mark picked_up /
-- delivered. The AI photo-diff of the dispatch note is
-- deferred (needs the key); the manual driver flow is here.
-- =====================================================

-- tables had RLS on with no policy → org members can read them
create policy vehicles_org_select on vehicles for select using (is_org_member(org_id));
create policy vehicle_trips_org_select on vehicle_trips for select using (is_org_member(org_id));
create policy delivery_tasks_org_select on delivery_tasks for select using (is_org_member(org_id));

-- ---------- vehicle admin ----------
create or replace function public.create_vehicle(target_org uuid, payload jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; v_name text; v_type text;
begin
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  v_name := nullif(trim(payload->>'name'), '');
  if v_name is null then raise exception 'name_required'; end if;
  v_type := coalesce(nullif(payload->>'type', ''), 'van');
  if v_type not in ('van','truck','crane_truck','trailer','other') then
    raise exception 'invalid_type';
  end if;

  insert into vehicles (org_id, name, plate_number, type, has_crane, capacity_kg,
                        capacity_m3, max_item_length_m, can_carry_pallets, status)
  values (target_org, v_name, nullif(trim(payload->>'plate_number'),''), v_type,
          coalesce((payload->>'has_crane')::boolean, false),
          nullif(payload->>'capacity_kg','')::integer,
          nullif(replace(payload->>'capacity_m3',',','.'),'')::numeric,
          nullif(replace(payload->>'max_item_length_m',',','.'),'')::numeric,
          coalesce((payload->>'can_carry_pallets')::boolean, true),
          'available')
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.update_vehicle(vehicle_id uuid, payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare target_org uuid; v_name text; v_type text;
begin
  select org_id into target_org from vehicles where id = vehicle_id;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  v_name := nullif(trim(payload->>'name'), '');
  if v_name is null then raise exception 'name_required'; end if;
  v_type := coalesce(nullif(payload->>'type', ''), 'van');
  if v_type not in ('van','truck','crane_truck','trailer','other') then
    raise exception 'invalid_type';
  end if;

  update vehicles set
    name = v_name,
    plate_number = nullif(trim(payload->>'plate_number'),''),
    type = v_type,
    has_crane = coalesce((payload->>'has_crane')::boolean, false),
    capacity_kg = nullif(payload->>'capacity_kg','')::integer,
    capacity_m3 = nullif(replace(payload->>'capacity_m3',',','.'),'')::numeric,
    max_item_length_m = nullif(replace(payload->>'max_item_length_m',',','.'),'')::numeric,
    can_carry_pallets = coalesce((payload->>'can_carry_pallets')::boolean, true),
    status = coalesce(nullif(payload->>'status',''), status)
  where id = vehicle_id;
end $$;

-- ---------- plan a delivery from an order ----------
create or replace function public.plan_delivery(args jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid := (args->>'order_id')::uuid;
  ord record;
  new_id uuid;
  v_weight numeric;
  v_volume numeric;
  v_pickup uuid := nullif(args->>'pickup_location_id','')::uuid;
begin
  select * into ord from orders where id = v_order;
  if ord.id is null then raise exception 'not_found'; end if;
  if not is_supply(ord.org_id) then raise exception 'not_allowed'; end if;
  if exists (select 1 from delivery_tasks where order_id = v_order and status <> 'cancelled') then
    raise exception 'already_planned';
  end if;

  -- pickup is where the goods sit: explicit → own warehouse → site (NOT NULL)
  if v_pickup is null then
    select id into v_pickup from locations
    where org_id = ord.org_id and type = 'warehouse' order by created_at limit 1;
  end if;
  v_pickup := coalesce(v_pickup, ord.site_id);

  -- estimate weight/volume from the order lines × material fields
  select coalesce(sum(oi.quantity * coalesce(m.unit_weight_kg, 0)), 0),
         coalesce(sum(oi.quantity * coalesce(m.unit_volume_m3, 0)), 0)
    into v_weight, v_volume
  from order_items oi left join materials m on m.id = oi.material_id
  where oi.order_id = v_order;

  insert into delivery_tasks (org_id, order_id, created_via, delivery_method, priority,
                              dropoff_location_id, pickup_location_id,
                              est_weight_kg, est_volume_m3, status)
  values (ord.org_id, v_order, 'planned', 'own_vehicle',
          case when ord.is_hot then 'urgent' else 'normal' end,
          ord.site_id, v_pickup,
          nullif(v_weight, 0), nullif(v_volume, 0), 'assigned')
  returning id into new_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (ord.org_id, 'delivery_task', new_id, 'user', auth.uid(), 'planned',
          jsonb_build_object('order_id', v_order, 'weight_kg', v_weight));
  return new_id;
end $$;

-- ---------- assign vehicle + driver + date ----------
create or replace function public.assign_delivery(args jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_task uuid := (args->>'task_id')::uuid;
  target_org uuid;
  v_vehicle uuid := nullif(args->>'vehicle_id','')::uuid;
begin
  select org_id into target_org from delivery_tasks where id = v_task;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  if v_vehicle is not null and not exists (
    select 1 from vehicles where id = v_vehicle and org_id = target_org) then
    raise exception 'vehicle_not_found';
  end if;

  update delivery_tasks set
    vehicle_id = v_vehicle,
    assigned_to = nullif(args->>'driver_id','')::uuid,
    scheduled_date = nullif(args->>'scheduled_date','')::date,
    requires_crane = coalesce((args->>'requires_crane')::boolean, requires_crane)
  where id = v_task;
end $$;

-- ---------- trip start / end with odometer ----------
create or replace function public.start_trip(args jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_vehicle uuid := (args->>'vehicle_id')::uuid;
  target_org uuid;
  new_id uuid;
begin
  select org_id into target_org from vehicles where id = v_vehicle;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_org_member(target_org) then raise exception 'not_allowed'; end if;

  insert into vehicle_trips (org_id, vehicle_id, driver_id, started_at, odometer_start)
  values (target_org, v_vehicle, auth.uid(), now(),
          nullif(args->>'odometer_start','')::integer)
  returning id into new_id;
  update vehicles set status = 'in_use' where id = v_vehicle;
  return new_id;
end $$;

create or replace function public.end_trip(args jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_trip uuid := (args->>'trip_id')::uuid;
  trp record;
  v_end integer := nullif(args->>'odometer_end','')::integer;
begin
  select * into trp from vehicle_trips where id = v_trip;
  if trp.id is null then raise exception 'not_found'; end if;
  if not is_org_member(trp.org_id) then raise exception 'not_allowed'; end if;

  -- km_total is a generated column (odometer_end - odometer_start)
  update vehicle_trips set ended_at = now(), odometer_end = v_end
  where id = v_trip;
  update vehicles set status = 'available' where id = trp.vehicle_id;
end $$;

-- ---------- driver marks a stop picked_up / delivered ----------
create or replace function public.mark_delivery(args jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_task uuid := (args->>'task_id')::uuid;
  v_status text := args->>'status';
  task record;
begin
  select * into task from delivery_tasks where id = v_task;
  if task.id is null then raise exception 'not_found'; end if;
  if not is_org_member(task.org_id) then raise exception 'not_allowed'; end if;
  if v_status not in ('picked_up', 'delivered') then raise exception 'invalid_status'; end if;

  update delivery_tasks set
    status = v_status,
    picked_up_at = case when v_status = 'picked_up' then now() else picked_up_at end,
    delivered_at = case when v_status = 'delivered' then now() else delivered_at end,
    trip_id = coalesce(nullif(args->>'trip_id','')::uuid, trip_id),
    pickup_document_path = coalesce(nullif(args->>'photo_path',''), pickup_document_path)
  where id = v_task;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (task.org_id, 'delivery_task', v_task, 'user', auth.uid(), v_status, '{}'::jsonb);
end $$;

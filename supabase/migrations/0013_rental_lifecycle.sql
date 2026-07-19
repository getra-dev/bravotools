-- =====================================================
-- 0013 — SPEC 2.10: rented tools lifecycle
-- rental_intake: quick-create at the vendor desk with the
--   dispute-proof baseline (condition photos + engine hours)
-- return_to_vendor: give-back with photos/hours; the return
--   movement date is the system_period_end evidence for E3
--   invoice reconciliation. Reminders stop via status.
-- =====================================================

create or replace function public.rental_intake(args jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid := nullif(args->>'vendor_id', '')::uuid;
  v_name text := nullif(trim(coalesce(args->>'name', '')), '');
  v_site uuid := nullif(args->>'to_location_id', '')::uuid;
  v_hours numeric := nullif(replace(coalesce(args->>'engine_hours', ''), ',', '.'), '')::numeric;
  target_org uuid;
  vendor_loc uuid;
  new_tool uuid;
  mv_id uuid := gen_random_uuid();
  photo jsonb;
  photo_count integer := 0;
  qr text;
begin
  if v_vendor is null then raise exception 'vendor_required'; end if;
  select org_id into target_org from vendors where id = v_vendor;
  if target_org is null then raise exception 'not_found'; end if;
  perform assert_tool_editor(target_org);
  if v_name is null then raise exception 'name_required'; end if;

  for photo in select * from jsonb_array_elements(coalesce(args->'photos', '[]'::jsonb)) loop
    photo_count := photo_count + 1;
  end loop;
  if photo_count = 0 then
    raise exception 'photo_required';
  end if;

  select id into vendor_loc from locations
  where org_id = target_org and type = 'vendor' and vendor_id = v_vendor
  limit 1;

  qr := next_tool_qr(target_org);
  insert into tools (org_id, name, qr_code, ownership, status,
                     serial_number, rental_vendor_id, rental_rate_daily,
                     rental_start, rental_due_return,
                     tracks_engine_hours, engine_hours,
                     current_holder_id, current_location_id, notes)
  values (target_org, v_name, qr, 'rented', 'checked_out',
          nullif(trim(coalesce(args->>'serial_number', '')), ''),
          v_vendor,
          nullif(replace(coalesce(args->>'rental_rate_daily', ''), ',', '.'), '')::numeric,
          coalesce(nullif(args->>'rental_start', '')::date, current_date),
          nullif(args->>'rental_due_return', '')::date,
          v_hours is not null, v_hours,
          auth.uid(), coalesce(v_site, vendor_loc),
          nullif(trim(coalesce(args->>'note', '')), ''))
  returning id into new_tool;

  -- pickup movement from the vendor location (baseline evidence)
  insert into tool_movements (id, org_id, tool_id, action, from_location_id, to_location_id,
                              holder_id, performed_by, engine_hours_reading, notes)
  values (mv_id, target_org, new_tool, 'checkout', vendor_loc, v_site,
          auth.uid(), auth.uid(), v_hours,
          nullif(trim(coalesce(args->>'note', '')), ''));

  for photo in select * from jsonb_array_elements(coalesce(args->'photos', '[]'::jsonb)) loop
    insert into tool_photos (org_id, tool_id, movement_id, photo_type, storage_path, taken_by)
    values (target_org, new_tool, mv_id, 'original', photo->>'storage_path', auth.uid());
  end loop;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'tool', new_tool, 'user', auth.uid(), 'rental_intake',
          jsonb_build_object('vendor_id', v_vendor, 'qr', qr,
                             'engine_hours', v_hours, 'photos', photo_count));

  return jsonb_build_object('tool_id', new_tool, 'qr_code', qr);
end $$;

create or replace function public.return_to_vendor(args jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tool uuid := (args->>'tool_id')::uuid;
  v_hours numeric := nullif(replace(coalesce(args->>'engine_hours', ''), ',', '.'), '')::numeric;
  tool record;
  vendor_loc uuid;
  mv_id uuid := coalesce(nullif(args->>'movement_id', ''), gen_random_uuid()::text)::uuid;
  photo jsonb;
  photo_count integer := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  if exists (select 1 from tool_movements where id = mv_id) then
    return jsonb_build_object('duplicate', true);
  end if;

  select * into tool from tools where id = v_tool;
  if tool.id is null then raise exception 'not_found'; end if;
  if not is_org_member(tool.org_id) then raise exception 'not_allowed'; end if;
  if tool.ownership <> 'rented' then raise exception 'not_rented'; end if;
  if tool.status in ('returned_to_vendor', 'written_off') then
    raise exception 'already_returned';
  end if;

  for photo in select * from jsonb_array_elements(coalesce(args->'photos', '[]'::jsonb)) loop
    photo_count := photo_count + 1;
  end loop;
  if photo_count = 0 then
    raise exception 'photo_required';
  end if;

  select id into vendor_loc from locations
  where org_id = tool.org_id and type = 'vendor' and vendor_id = tool.rental_vendor_id
  limit 1;

  insert into tool_movements (id, org_id, tool_id, action, from_location_id, to_location_id,
                              performed_by, performed_at, engine_hours_reading, notes,
                              gps_latitude, gps_longitude)
  values (mv_id, tool.org_id, v_tool, 'checkin', tool.current_location_id, vendor_loc,
          auth.uid(),
          coalesce(nullif(args->>'performed_at', '')::timestamptz, now()),
          v_hours, nullif(trim(coalesce(args->>'note', '')), ''),
          nullif(args->>'gps_lat', '')::numeric, nullif(args->>'gps_lng', '')::numeric);

  for photo in select * from jsonb_array_elements(coalesce(args->'photos', '[]'::jsonb)) loop
    insert into tool_photos (org_id, tool_id, movement_id, photo_type, storage_path, taken_by)
    values (tool.org_id, v_tool, mv_id, 'checkin', photo->>'storage_path', auth.uid());
  end loop;

  update tools set status = 'returned_to_vendor',
                   current_holder_id = null,
                   current_external_holder_id = null,
                   current_location_id = vendor_loc,
                   engine_hours = coalesce(v_hours, engine_hours)
  where id = v_tool;

  -- reconciliation evidence for E3: actual give-back date lives on the
  -- movement; also announce to the supply group
  insert into notifications (org_id, user_id, type, title, body, entity_type, entity_id)
  select tool.org_id, m.user_id, 'system',
         'Rental returned: ' || coalesce(tool.qr_code, tool.name),
         tool.name || ' returned to vendor on ' || current_date,
         'tool', v_tool
  from memberships m
  where m.org_id = tool.org_id and m.role in ('owner', 'admin', 'supply_manager')
    and m.user_id <> auth.uid();

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (tool.org_id, 'tool', v_tool, 'user', auth.uid(), 'returned_to_vendor',
          jsonb_build_object('movement_id', mv_id, 'engine_hours', v_hours,
                             'photos', photo_count));

  return jsonb_build_object('movement_id', mv_id, 'duplicate', false);
end $$;

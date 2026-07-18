-- =====================================================
-- 0007 — owner requirements from device testing (2026-07-18/19):
-- 1) component-level condition photos: tool_photos.component_id
-- 2) both parties can leave notes on the act:
--    giver note -> tool_movements.notes,
--    receiver note -> comments (entity_type 'handover_act')
-- perform_handover updated to accept both.
-- =====================================================

alter table tool_photos
  add column component_id uuid references tool_components(id) on delete set null;

create index idx_photos_component on tool_photos (component_id)
  where component_id is not null;

create or replace function public.perform_handover(args jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_movement_id uuid := coalesce(nullif(args->>'movement_id', ''), gen_random_uuid()::text)::uuid;
  v_act_id uuid := coalesce(nullif(args->>'act_id', ''), gen_random_uuid()::text)::uuid;
  v_tool_id uuid := (args->>'tool_id')::uuid;
  v_action text := args->>'action';
  v_receiver_profile uuid := nullif(args->>'receiver_profile_id', '')::uuid;
  v_receiver_external uuid := nullif(args->>'receiver_external_id', '')::uuid;
  v_to_location uuid := nullif(args->>'to_location_id', '')::uuid;
  v_engine_hours numeric := nullif(args->>'engine_hours', '')::numeric;
  v_gps_lat numeric := nullif(args->>'gps_lat', '')::numeric;
  v_gps_lng numeric := nullif(args->>'gps_lng', '')::numeric;
  v_giver_sig text := nullif(args->>'giver_signature_path', '');
  v_receiver_sig text := nullif(args->>'receiver_signature_path', '');
  v_giver_note text := nullif(trim(coalesce(args->>'giver_note', '')), '');
  v_receiver_note text := nullif(trim(coalesce(args->>'receiver_note', '')), '');
  tool record;
  org_requires_photo boolean;
  existing record;
  comp jsonb;
  photo jsonb;
  photo_count integer := 0;
  act_no text;
  last_checkout uuid;
  v_giver uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select m.id, a.id as act_id, a.act_number into existing
  from tool_movements m
  left join handover_acts a on a.movement_id = m.id
  where m.id = v_movement_id;
  if found then
    return jsonb_build_object('movement_id', existing.id, 'act_id', existing.act_id,
                              'act_number', existing.act_number, 'duplicate', true);
  end if;

  select * into tool from tools where id = v_tool_id;
  if tool.id is null then raise exception 'not_found'; end if;
  if not is_org_member(tool.org_id) then raise exception 'not_allowed'; end if;

  if v_action not in ('checkout', 'checkin', 'transfer') then
    raise exception 'invalid_action';
  end if;
  if v_action = 'checkout' and tool.status <> 'available' then
    raise exception 'tool_not_available';
  end if;
  if v_action in ('checkin', 'transfer') and tool.status <> 'checked_out' then
    raise exception 'tool_not_checked_out';
  end if;
  if v_action in ('checkout', 'transfer')
     and v_receiver_profile is null and v_receiver_external is null then
    raise exception 'receiver_required';
  end if;

  select coalesce((settings->>'require_photo_on_handover')::boolean, true)
    into org_requires_photo
  from organizations where id = tool.org_id;

  for photo in select * from jsonb_array_elements(coalesce(args->'photos', '[]'::jsonb)) loop
    photo_count := photo_count + 1;
  end loop;
  if org_requires_photo and photo_count = 0 then
    raise exception 'photo_required';
  end if;

  if v_giver_sig is null or v_receiver_sig is null then
    raise exception 'signatures_required';
  end if;

  v_giver := case when v_action = 'checkout' then auth.uid() else tool.current_holder_id end;

  insert into tool_movements (id, org_id, tool_id, action, from_location_id, to_location_id,
                              holder_id, external_holder_id, performed_by, performed_at,
                              gps_latitude, gps_longitude, engine_hours_reading, notes)
  values (v_movement_id, tool.org_id, v_tool_id, v_action,
          tool.current_location_id, v_to_location,
          case when v_action = 'checkin' then null else v_receiver_profile end,
          case when v_action = 'checkin' then null else v_receiver_external end,
          auth.uid(),
          coalesce(nullif(args->>'performed_at', '')::timestamptz, now()),
          v_gps_lat, v_gps_lng, v_engine_hours, v_giver_note);

  for comp in select * from jsonb_array_elements(coalesce(args->'components', '[]'::jsonb)) loop
    insert into movement_components (movement_id, component_id, included, condition_note)
    values (v_movement_id, (comp->>'component_id')::uuid,
            coalesce((comp->>'included')::boolean, true),
            nullif(comp->>'condition_note', ''));
  end loop;

  if v_action = 'checkin' then
    select m.id into last_checkout
    from tool_movements m
    where m.tool_id = v_tool_id and m.action in ('checkout', 'transfer')
      and m.id <> v_movement_id
    order by m.performed_at desc limit 1;

    if last_checkout is not null then
      update tool_components tc set status = 'lost'
      where tc.tool_id = v_tool_id
        and tc.status = 'ok'
        and exists (select 1 from movement_components mc
                    where mc.movement_id = last_checkout
                      and mc.component_id = tc.id and mc.included)
        and not exists (select 1 from movement_components mc
                        where mc.movement_id = v_movement_id
                          and mc.component_id = tc.id and mc.included);
    end if;
    update tool_components tc set status = 'ok'
    where tc.tool_id = v_tool_id
      and tc.status = 'lost'
      and exists (select 1 from movement_components mc
                  where mc.movement_id = v_movement_id
                    and mc.component_id = tc.id and mc.included);
  end if;

  -- photos: optional component_id ties a photo to a checklist component
  for photo in select * from jsonb_array_elements(coalesce(args->'photos', '[]'::jsonb)) loop
    insert into tool_photos (org_id, tool_id, movement_id, component_id, photo_type,
                             storage_path, taken_by)
    values (tool.org_id, v_tool_id, v_movement_id,
            nullif(photo->>'component_id', '')::uuid,
            case when v_action = 'checkin' then 'checkin' else 'checkout' end,
            photo->>'storage_path', auth.uid());
  end loop;

  act_no := next_act_number(tool.org_id);
  insert into handover_acts (id, org_id, act_number, movement_id, status,
                             giver_id, giver_signed_at, giver_signature_path,
                             receiver_id, external_receiver_id, receiver_signed_at,
                             receiver_signature_path)
  values (v_act_id, tool.org_id, act_no, v_movement_id, 'signed',
          v_giver, now(), v_giver_sig,
          case when v_action = 'checkin' then auth.uid() else v_receiver_profile end,
          case when v_action = 'checkin' then null else v_receiver_external end,
          now(), v_receiver_sig);

  -- receiver's note lives as a comment on the act (schema reuse, stays
  -- separable from the giver note for the PDF)
  if v_receiver_note is not null then
    insert into comments (org_id, entity_type, entity_id, author_type, author_id, body)
    values (tool.org_id, 'handover_act', v_act_id, 'user', auth.uid(), v_receiver_note);
  end if;

  if v_action = 'checkin' then
    update tools set status = 'available',
                     current_holder_id = null,
                     current_external_holder_id = null,
                     current_location_id = coalesce(v_to_location, current_location_id),
                     engine_hours = coalesce(v_engine_hours, engine_hours)
    where id = v_tool_id;
  else
    update tools set status = 'checked_out',
                     current_holder_id = v_receiver_profile,
                     current_external_holder_id = v_receiver_external,
                     current_location_id = coalesce(v_to_location, current_location_id),
                     engine_hours = coalesce(v_engine_hours, engine_hours)
    where id = v_tool_id;
  end if;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (tool.org_id, 'tool', v_tool_id, 'user', auth.uid(), v_action,
          jsonb_build_object('act_number', act_no, 'movement_id', v_movement_id,
                             'photos', photo_count));

  return jsonb_build_object('movement_id', v_movement_id, 'act_id', v_act_id,
                            'act_number', act_no, 'duplicate', false);
end $$;

-- comments on acts must be readable by org members (PDF + timelines)
create policy comments_org_select on comments
  for select using (is_org_member(org_id));

-- =====================================================
-- 0010 — ADR-015: receiver countersigns on their OWN phone
-- initiate_handover: initiator signs their side, movement +
--   tool state land immediately, act = pending_signatures,
--   counterparty gets a notification.
-- countersign_handover: the other party (their own session)
--   reviews and signs → act = signed, initiator notified.
-- Counterparty rules:
--   checkout/transfer → the chosen receiver (org member);
--   checkin → initiated by the returning holder; any
--     owner/admin/supply_manager countersigns receipt.
-- External receivers keep the one-device perform_handover.
-- =====================================================

create or replace function public.initiate_handover(args jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_movement_id uuid := coalesce(nullif(args->>'movement_id', ''), gen_random_uuid()::text)::uuid;
  v_act_id uuid := coalesce(nullif(args->>'act_id', ''), gen_random_uuid()::text)::uuid;
  v_tool_id uuid := (args->>'tool_id')::uuid;
  v_action text := args->>'action';
  v_receiver_profile uuid := nullif(args->>'receiver_profile_id', '')::uuid;
  v_to_location uuid := nullif(args->>'to_location_id', '')::uuid;
  v_engine_hours numeric := nullif(args->>'engine_hours', '')::numeric;
  v_gps_lat numeric := nullif(args->>'gps_lat', '')::numeric;
  v_gps_lng numeric := nullif(args->>'gps_lng', '')::numeric;
  v_signature text := nullif(args->>'signature_path', '');
  v_note text := nullif(trim(coalesce(args->>'note', '')), '');
  tool record;
  org_requires_photo boolean;
  existing record;
  comp jsonb;
  photo jsonb;
  photo_count integer := 0;
  act_no text;
  last_checkout uuid;
  v_giver uuid;
  tool_label text;
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
  if v_action in ('checkout', 'transfer') and v_receiver_profile is null then
    raise exception 'receiver_required';
  end if;
  if v_action = 'checkin' and tool.current_holder_id is not null
     and tool.current_holder_id <> auth.uid() then
    raise exception 'not_the_holder';
  end if;
  if v_signature is null then
    raise exception 'signatures_required';
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

  v_giver := case when v_action = 'checkin' then tool.current_holder_id else auth.uid() end;

  insert into tool_movements (id, org_id, tool_id, action, from_location_id, to_location_id,
                              holder_id, external_holder_id, performed_by, performed_at,
                              gps_latitude, gps_longitude, engine_hours_reading, notes)
  values (v_movement_id, tool.org_id, v_tool_id, v_action,
          tool.current_location_id, v_to_location,
          case when v_action = 'checkin' then null else v_receiver_profile end,
          null,
          auth.uid(),
          coalesce(nullif(args->>'performed_at', '')::timestamptz, now()),
          v_gps_lat, v_gps_lng, v_engine_hours,
          case when v_action = 'checkin' then v_note else v_note end);

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

    perform notify_missing_components(tool.org_id, v_tool_id, v_movement_id);
  end if;

  for photo in select * from jsonb_array_elements(coalesce(args->'photos', '[]'::jsonb)) loop
    insert into tool_photos (org_id, tool_id, movement_id, component_id, photo_type,
                             storage_path, taken_by)
    values (tool.org_id, v_tool_id, v_movement_id,
            nullif(photo->>'component_id', '')::uuid,
            case when v_action = 'checkin' then 'checkin' else 'checkout' end,
            photo->>'storage_path', auth.uid());
  end loop;

  act_no := next_act_number(tool.org_id);
  -- initiator signs their own side; the other side stays empty until
  -- countersign_handover
  insert into handover_acts (id, org_id, act_number, movement_id, status,
                             giver_id, giver_signed_at, giver_signature_path,
                             receiver_id, receiver_signed_at, receiver_signature_path)
  values (v_act_id, tool.org_id, act_no, v_movement_id, 'pending_signatures',
          v_giver,
          case when v_action = 'checkin' and v_giver <> auth.uid() then null else now() end,
          case when v_action = 'checkin' and v_giver <> auth.uid() then null else v_signature end,
          case when v_action = 'checkin' then null else v_receiver_profile end,
          null, null);

  -- tool state changes at the physical moment (initiation)
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
                     current_external_holder_id = null,
                     current_location_id = coalesce(v_to_location, current_location_id),
                     engine_hours = coalesce(v_engine_hours, engine_hours)
    where id = v_tool_id;
  end if;

  tool_label := coalesce(tool.qr_code, tool.name);

  -- who has to countersign?
  if v_action = 'checkin' then
    insert into notifications (org_id, user_id, type, title, body, entity_type, entity_id)
    select tool.org_id, m.user_id, 'system',
           'Signature requested: ' || act_no,
           'Return of ' || tool_label || ' needs your confirmation signature',
           'handover_act', v_act_id
    from memberships m
    where m.org_id = tool.org_id
      and m.role in ('owner', 'admin', 'supply_manager')
      and m.user_id <> auth.uid();
  else
    insert into notifications (org_id, user_id, type, title, body, entity_type, entity_id)
    values (tool.org_id, v_receiver_profile, 'system',
            'Signature requested: ' || act_no,
            'You received ' || tool_label || ' — review and sign',
            'handover_act', v_act_id);
  end if;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (tool.org_id, 'tool', v_tool_id, 'user', auth.uid(), v_action,
          jsonb_build_object('act_number', act_no, 'movement_id', v_movement_id,
                             'photos', photo_count, 'remote_signature', true));

  return jsonb_build_object('movement_id', v_movement_id, 'act_id', v_act_id,
                            'act_number', act_no, 'duplicate', false);
end $$;

create or replace function public.countersign_handover(
  act_id uuid, signature_path text, note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  act record;
  mv record;
  caller_role text;
  side text;
  v_note text := nullif(trim(coalesce(note, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if nullif(signature_path, '') is null then raise exception 'signatures_required'; end if;

  select * into act from handover_acts where id = act_id;
  if act.id is null then raise exception 'not_found'; end if;
  if not is_org_member(act.org_id) then raise exception 'not_allowed'; end if;
  if act.status <> 'pending_signatures' then raise exception 'act_not_pending'; end if;

  select * into mv from tool_movements where id = act.movement_id;

  if act.receiver_signature_path is null and act.receiver_id is not null then
    -- receiver side pending: only the named receiver may sign
    if act.receiver_id <> auth.uid() then raise exception 'not_your_signature'; end if;
    side := 'receiver';
  elsif act.receiver_signature_path is null and act.receiver_id is null then
    -- return receipt: any supply-side role signs as receiver
    select role into caller_role
    from memberships where org_id = act.org_id and user_id = auth.uid();
    if caller_role is null or caller_role not in ('owner', 'admin', 'supply_manager') then
      raise exception 'not_your_signature';
    end if;
    side := 'receiver_supply';
  elsif act.giver_signature_path is null and act.giver_id is not null then
    -- giver side pending (return initiated by someone else)
    if act.giver_id <> auth.uid() then raise exception 'not_your_signature'; end if;
    side := 'giver';
  else
    raise exception 'act_not_pending';
  end if;

  if side in ('receiver', 'receiver_supply') then
    update handover_acts
    set receiver_id = coalesce(receiver_id, auth.uid()),
        receiver_signed_at = now(),
        receiver_signature_path = signature_path,
        status = case when giver_signature_path is not null then 'signed' else status end
    where id = act_id;
  else
    update handover_acts
    set giver_signed_at = now(),
        giver_signature_path = signature_path,
        status = case when receiver_signature_path is not null then 'signed' else status end
    where id = act_id;
  end if;

  if v_note is not null then
    insert into comments (org_id, entity_type, entity_id, author_type, author_id, body)
    values (act.org_id, 'handover_act', act_id, 'user', auth.uid(), v_note);
  end if;

  -- tell the initiator the act is complete
  insert into notifications (org_id, user_id, type, title, body, entity_type, entity_id)
  select act.org_id, mv.performed_by, 'system',
         'Act signed: ' || act.act_number,
         null, 'handover_act', act_id
  where mv.performed_by <> auth.uid();

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (act.org_id, 'handover_act', act_id, 'user', auth.uid(), 'countersigned',
          jsonb_build_object('act_number', act.act_number, 'side', side));

  return jsonb_build_object('act_number', act.act_number,
                            'status', (select status from handover_acts where id = act_id));
end $$;

-- =====================================================
-- 0005 — SPEC 2.4: Handover flow
-- 1) storage buckets (tool-photos, signatures, acts) with
--    org-prefix RLS: path convention <org_id>/...
-- 2) create_external_person RPC (inline receiver creation)
-- 3) perform_handover RPC — checkout / checkin / transfer:
--    movement + component checklist + photos + act with
--    per-year numbering (BT-AKT-YYYY-####), return diff
--    flags missing components, client-UUID idempotency
--    (foundation for the 2.6 offline outbox).
-- =====================================================

-- ---------- 1. storage ----------

insert into storage.buckets (id, name, public) values
  ('tool-photos', 'tool-photos', false),
  ('signatures', 'signatures', false),
  ('acts', 'acts', false)
on conflict (id) do nothing;

create policy tool_photos_org_read on storage.objects for select
  using (bucket_id = 'tool-photos' and is_org_member(((storage.foldername(name))[1])::uuid));
create policy tool_photos_org_insert on storage.objects for insert
  with check (bucket_id = 'tool-photos' and is_org_member(((storage.foldername(name))[1])::uuid));

create policy signatures_org_read on storage.objects for select
  using (bucket_id = 'signatures' and is_org_member(((storage.foldername(name))[1])::uuid));
create policy signatures_org_insert on storage.objects for insert
  with check (bucket_id = 'signatures' and is_org_member(((storage.foldername(name))[1])::uuid));

create policy acts_org_read on storage.objects for select
  using (bucket_id = 'acts' and is_org_member(((storage.foldername(name))[1])::uuid));
create policy acts_org_insert on storage.objects for insert
  with check (bucket_id = 'acts' and is_org_member(((storage.foldername(name))[1])::uuid));

-- ---------- 2. inline external receiver ----------

create or replace function public.create_external_person(
  target_org uuid, person_name text, person_phone text default null, person_position text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not is_org_member(target_org) then raise exception 'not_allowed'; end if;
  if coalesce(trim(person_name), '') = '' then raise exception 'name_required'; end if;

  insert into external_persons (org_id, full_name, phone, position)
  values (target_org, trim(person_name), nullif(trim(person_phone), ''), nullif(trim(person_position), ''))
  returning id into new_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'tool', new_id, 'user', auth.uid(), 'external_person_created',
          jsonb_build_object('full_name', trim(person_name)));
  return new_id;
end $$;

-- ---------- 3. act numbering (per org, per year) ----------

create or replace function public.next_act_number(target_org uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  counter integer;
  act_year text;
  this_year text := to_char(now(), 'YYYY');
  prefix text;
begin
  select coalesce(settings#>>'{numbering,act,year}', ''),
         coalesce((settings#>>'{numbering,act,counter}')::integer, 0),
         coalesce(settings#>>'{numbering,act,prefix}', 'BT-AKT-')
    into act_year, counter, prefix
  from organizations where id = target_org for update;

  if act_year <> this_year then
    counter := 0;
  end if;
  counter := counter + 1;

  update organizations
  set settings = jsonb_set(
        jsonb_set(coalesce(settings, '{}'::jsonb), '{numbering}',
                  coalesce(settings->'numbering', '{}'::jsonb), true),
        '{numbering,act}',
        jsonb_build_object('prefix', prefix, 'year', this_year, 'counter', counter), true)
  where id = target_org;

  return prefix || this_year || '-' || lpad(counter::text, 4, '0');
end $$;

-- acts stay immutable for clients; only the generated-PDF pointer may be set
create or replace function public.set_act_pdf_path(act_id uuid, pdf_path text)
returns void
language plpgsql security definer set search_path = public as $$
declare target_org uuid;
begin
  select org_id into target_org from handover_acts where id = act_id;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_org_member(target_org) then raise exception 'not_allowed'; end if;
  update handover_acts set pdf_storage_path = pdf_path where id = act_id;
end $$;

-- ---------- 4. perform_handover ----------

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

  -- idempotency: same client movement uuid ⇒ already synced, return as-is
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

  -- giver: on checkout the performer hands over; on checkin/transfer the
  -- current internal holder gives (may be null when held by external person)
  v_giver := case when v_action = 'checkout' then auth.uid() else tool.current_holder_id end;

  insert into tool_movements (id, org_id, tool_id, action, from_location_id, to_location_id,
                              holder_id, external_holder_id, performed_by, performed_at,
                              gps_latitude, gps_longitude, engine_hours_reading)
  values (v_movement_id, tool.org_id, v_tool_id, v_action,
          tool.current_location_id, v_to_location,
          case when v_action = 'checkin' then null else v_receiver_profile end,
          case when v_action = 'checkin' then null else v_receiver_external end,
          auth.uid(),
          coalesce(nullif(args->>'performed_at', '')::timestamptz, now()),
          v_gps_lat, v_gps_lng, v_engine_hours);

  -- component checklist
  for comp in select * from jsonb_array_elements(coalesce(args->'components', '[]'::jsonb)) loop
    insert into movement_components (movement_id, component_id, included, condition_note)
    values (v_movement_id, (comp->>'component_id')::uuid,
            coalesce((comp->>'included')::boolean, true),
            nullif(comp->>'condition_note', ''));
  end loop;

  -- return diff: anything included at the last checkout/transfer but not
  -- returned now is flagged lost; returned items recover to ok
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

  -- photos metadata
  for photo in select * from jsonb_array_elements(coalesce(args->'photos', '[]'::jsonb)) loop
    insert into tool_photos (org_id, tool_id, movement_id, photo_type, storage_path, taken_by)
    values (tool.org_id, v_tool_id, v_movement_id,
            case when v_action = 'checkin' then 'checkin' else 'checkout' end,
            photo->>'storage_path', auth.uid());
  end loop;

  -- act, signed on the spot by both parties
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

  -- tool state
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

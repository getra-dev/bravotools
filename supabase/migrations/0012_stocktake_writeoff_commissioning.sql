-- =====================================================
-- 0012 — SPEC 2.9 owner backlog:
-- 1) Inventorizacija: inventory_sessions + inventory_scans
--    (genuinely new — no equivalent structure existed;
--    reuse-checked against tools/movements/activity_log)
-- 2) Nurašymas: write_off_tool RPC (reason, evidence,
--    recharge hook flag when held by an external person)
-- 3) Priėmimas į eksploataciją: component / inspection /
--    photo management RPCs for the tool card
-- =====================================================

-- ---------- 1. stocktake ----------

create table inventory_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id),
  status text not null default 'open' check (status in ('open', 'closed')),
  started_by uuid not null references profiles(id),
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  report jsonb
);

-- only one OPEN session per location (closed history unlimited)
create unique index idx_inventory_one_open
  on inventory_sessions (location_id) where status = 'open';

create table inventory_scans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references inventory_sessions(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  result text not null check (result in ('found', 'misplaced')),
  expected_location_id uuid references locations(id),
  scanned_by uuid not null references profiles(id),
  scanned_at timestamptz not null default now(),
  unique (session_id, tool_id)
);

alter table inventory_sessions enable row level security;
alter table inventory_scans enable row level security;

create policy inventory_sessions_org_select on inventory_sessions
  for select using (is_org_member(org_id));
create policy inventory_scans_org_select on inventory_scans
  for select using (exists (
    select 1 from inventory_sessions s
    where s.id = inventory_scans.session_id and is_org_member(s.org_id)
  ));

create or replace function public.start_inventory_session(target_location uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  target_org uuid;
  new_id uuid;
begin
  select org_id into target_org from locations where id = target_location;
  if target_org is null then raise exception 'not_found'; end if;
  perform assert_location_editor(target_org);

  if exists (select 1 from inventory_sessions
             where location_id = target_location and status = 'open') then
    raise exception 'session_already_open';
  end if;

  insert into inventory_sessions (org_id, location_id, started_by)
  values (target_org, target_location, auth.uid())
  returning id into new_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'location', target_location, 'user', auth.uid(),
          'inventory_started', jsonb_build_object('session_id', new_id));
  return new_id;
end $$;

create or replace function public.record_inventory_scan(target_session uuid, target_tool uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  session record;
  tool record;
  scan_result text;
begin
  select * into session from inventory_sessions where id = target_session;
  if session.id is null then raise exception 'not_found'; end if;
  perform assert_location_editor(session.org_id);
  if session.status <> 'open' then raise exception 'session_closed'; end if;

  select * into tool from tools where id = target_tool;
  if tool.id is null or tool.org_id <> session.org_id then
    raise exception 'not_found';
  end if;

  scan_result := case
    when tool.current_location_id = session.location_id then 'found'
    else 'misplaced'
  end;

  insert into inventory_scans (session_id, tool_id, result, expected_location_id, scanned_by)
  values (target_session, target_tool, scan_result, tool.current_location_id, auth.uid())
  on conflict (session_id, tool_id) do nothing;

  return jsonb_build_object('result', scan_result,
                            'expected_location_id', tool.current_location_id);
end $$;

create or replace function public.close_inventory_session(
  target_session uuid, mark_missing_lost boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  session record;
  found_count integer;
  misplaced_count integer;
  missing_ids uuid[];
  missing_names text;
  member record;
  rep jsonb;
begin
  select * into session from inventory_sessions where id = target_session;
  if session.id is null then raise exception 'not_found'; end if;
  perform assert_location_editor(session.org_id);
  if session.status <> 'open' then raise exception 'session_closed'; end if;

  select count(*) filter (where result = 'found'),
         count(*) filter (where result = 'misplaced')
    into found_count, misplaced_count
  from inventory_scans where session_id = target_session;

  -- expected at this location but never scanned = missing
  select coalesce(array_agg(t.id), '{}') into missing_ids
  from tools t
  where t.current_location_id = session.location_id
    and t.status in ('available', 'checked_out', 'in_service')
    and not exists (select 1 from inventory_scans s
                    where s.session_id = target_session and s.tool_id = t.id);

  if mark_missing_lost and array_length(missing_ids, 1) is not null then
    update tools set status = 'lost' where id = any(missing_ids);

    select string_agg(coalesce(qr_code, name), ', ') into missing_names
    from tools where id = any(missing_ids);
    for member in select user_id from memberships
                  where org_id = session.org_id
                    and role in ('owner', 'admin', 'supply_manager')
    loop
      insert into notifications (org_id, user_id, type, title, body, entity_type, entity_id)
      values (session.org_id, member.user_id, 'system',
              'Inventory: missing tools marked lost',
              missing_names, 'location', session.location_id);
    end loop;
  end if;

  rep := jsonb_build_object(
    'found', found_count,
    'misplaced', misplaced_count,
    'missing', coalesce(array_length(missing_ids, 1), 0),
    'missing_tool_ids', to_jsonb(missing_ids),
    'marked_lost', mark_missing_lost
  );

  update inventory_sessions
  set status = 'closed', closed_at = now(), report = rep
  where id = target_session;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (session.org_id, 'location', session.location_id, 'user', auth.uid(),
          'inventory_closed', rep || jsonb_build_object('session_id', target_session));
  return rep;
end $$;

-- ---------- 2. write-off ----------

create or replace function public.write_off_tool(
  target_tool uuid, reason text, note text default null,
  photo_paths jsonb default '[]'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  tool record;
  caller_role text;
  photo jsonb;
  mv_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into tool from tools where id = target_tool;
  if tool.id is null then raise exception 'not_found'; end if;

  select role into caller_role
  from memberships where org_id = tool.org_id and user_id = auth.uid();
  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'not_allowed';
  end if;
  if reason not in ('broken', 'lost', 'stolen', 'worn_out') then
    raise exception 'invalid_reason';
  end if;
  if tool.status = 'written_off' then raise exception 'already_written_off'; end if;

  insert into tool_movements (id, org_id, tool_id, action, from_location_id,
                              performed_by, notes)
  values (mv_id, tool.org_id, target_tool, 'write_off', tool.current_location_id,
          auth.uid(), nullif(trim(coalesce(note, '')), ''));

  for photo in select * from jsonb_array_elements(photo_paths) loop
    insert into tool_photos (org_id, tool_id, movement_id, photo_type, storage_path, taken_by)
    values (tool.org_id, target_tool, mv_id, 'damage', photo->>'storage_path', auth.uid());
  end loop;

  update tools set status = 'written_off',
                   current_holder_id = null,
                   current_external_holder_id = null
  where id = target_tool;

  -- recharge hook (E3): a tool lost while held by a subcontractor is billable
  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (tool.org_id, 'tool', target_tool, 'user', auth.uid(), 'written_off',
          jsonb_build_object(
            'reason', reason,
            'movement_id', mv_id,
            'billable_external_loss', tool.current_external_holder_id is not null,
            'external_holder_id', tool.current_external_holder_id,
            'purchase_price', tool.purchase_price));
end $$;

-- ---------- 3. commissioning helpers ----------

create or replace function public.add_tool_component(
  target_tool uuid, component_name text, component_qty integer default 1,
  serial text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare tool record; new_id uuid;
begin
  select * into tool from tools where id = target_tool;
  if tool.id is null then raise exception 'not_found'; end if;
  perform assert_tool_editor(tool.org_id);
  if coalesce(trim(component_name), '') = '' then raise exception 'name_required'; end if;

  insert into tool_components (org_id, tool_id, name, quantity, serial_number)
  values (tool.org_id, target_tool, trim(component_name),
          greatest(coalesce(component_qty, 1), 1), nullif(trim(coalesce(serial, '')), ''))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.remove_tool_component(component_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare comp record;
begin
  select tc.*, t.org_id as tool_org into comp
  from tool_components tc join tools t on t.id = tc.tool_id
  where tc.id = component_id;
  if comp.id is null then raise exception 'not_found'; end if;
  perform assert_tool_editor(comp.tool_org);
  delete from tool_components where id = component_id;
end $$;

create or replace function public.add_inspection_schedule(
  target_tool uuid, itype text, months integer, due date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare tool record; new_id uuid;
begin
  select * into tool from tools where id = target_tool;
  if tool.id is null then raise exception 'not_found'; end if;
  perform assert_tool_editor(tool.org_id);
  if itype not in ('electrical_safety', 'lifting_certificate', 'calibration', 'general') then
    raise exception 'invalid_type';
  end if;

  insert into inspection_schedules (org_id, tool_id, inspection_type, interval_months, next_due)
  values (tool.org_id, target_tool, itype, months, due)
  on conflict (tool_id, inspection_type)
    do update set interval_months = excluded.interval_months, next_due = excluded.next_due
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.add_tool_photo(target_tool uuid, path text)
returns void
language plpgsql security definer set search_path = public as $$
declare tool record;
begin
  select * into tool from tools where id = target_tool;
  if tool.id is null then raise exception 'not_found'; end if;
  perform assert_tool_editor(tool.org_id);
  insert into tool_photos (org_id, tool_id, photo_type, storage_path, taken_by)
  values (tool.org_id, target_tool, 'original', path, auth.uid());
end $$;

-- inspections readable by org members (tool card + reminders already query)
create policy inspections_org_select on inspection_schedules
  for select using (is_org_member(org_id));

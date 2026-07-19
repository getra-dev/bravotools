-- Test: SPEC 2.9 stocktake + write-off + commissioning helpers (0012).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('abcdabcd-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'boss@t29.local', now(), now()),
  ('abcdabcd-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t29.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"abcdabcd-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t29_ctx as
  select create_organization('T29 Audit Org') as org_id;

do $$
declare org uuid;
begin
  select org_id into org from t29_ctx;
  perform invite_member(org, 'worker@t29.local', 'worker');
end $$;

reset role;
do $$
declare org uuid;
begin
  select org_id into org from t29_ctx;
  insert into locations (id, org_id, type, name) values
    ('abcdabcd-3333-0000-0000-000000000001', org, 'warehouse', 'T29 Sandelis'),
    ('abcdabcd-3333-0000-0000-000000000002', org, 'site', 'T29 Objektas');
  insert into tools (id, org_id, name, qr_code, status, current_location_id, purchase_price) values
    ('abcdabcd-2222-0000-0000-000000000001', org, 'T29 Drill', 'T29-QR-1', 'available',
     'abcdabcd-3333-0000-0000-000000000001', 100),
    ('abcdabcd-2222-0000-0000-000000000002', org, 'T29 Saw', 'T29-QR-2', 'available',
     'abcdabcd-3333-0000-0000-000000000001', 200),
    -- system thinks it is on site, will be scanned in warehouse = misplaced
    ('abcdabcd-2222-0000-0000-000000000003', org, 'T29 Grinder', 'T29-QR-3', 'available',
     'abcdabcd-3333-0000-0000-000000000002', 300);
end $$;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"abcdabcd-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ---------- stocktake lifecycle ----------
create temporary table t29_session as
  select start_inventory_session('abcdabcd-3333-0000-0000-000000000001') as sid;

do $$
declare sid uuid; res jsonb; rep jsonb;
begin
  select t29_session.sid into sid from t29_session;

  begin
    perform start_inventory_session('abcdabcd-3333-0000-0000-000000000001');
    raise exception 'FAIL: second open session allowed for the same location';
  exception when others then
    if sqlerrm not like '%session_already_open%' then raise; end if;
  end;

  select record_inventory_scan(sid, 'abcdabcd-2222-0000-0000-000000000001') into res;
  if res->>'result' <> 'found' then
    raise exception 'FAIL: expected found, got %', res->>'result';
  end if;
  select record_inventory_scan(sid, 'abcdabcd-2222-0000-0000-000000000003') into res;
  if res->>'result' <> 'misplaced' then
    raise exception 'FAIL: expected misplaced, got %', res->>'result';
  end if;

  -- T29 Saw is never scanned → missing → lost
  select close_inventory_session(sid, true) into rep;
  if (rep->>'found')::int <> 1 or (rep->>'misplaced')::int <> 1 or (rep->>'missing')::int <> 1 then
    raise exception 'FAIL: report wrong: %', rep;
  end if;
  if (select status from tools where id = 'abcdabcd-2222-0000-0000-000000000002') <> 'lost' then
    raise exception 'FAIL: missing tool not marked lost';
  end if;
  if (select status from inventory_sessions where id = sid) <> 'closed' then
    raise exception 'FAIL: session not closed';
  end if;
end $$;

-- worker cannot run audits
set local request.jwt.claims =
  '{"sub":"abcdabcd-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
begin
  begin
    perform start_inventory_session('abcdabcd-3333-0000-0000-000000000002');
    raise exception 'FAIL: worker started an audit';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- ---------- write-off ----------
set local request.jwt.claims =
  '{"sub":"abcdabcd-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare org uuid;
begin
  select org_id into org from t29_ctx;
  perform write_off_tool('abcdabcd-2222-0000-0000-000000000003', 'broken', 'variklis sudege',
                         jsonb_build_array(jsonb_build_object('storage_path', org || '/x/w1.jpg')));
  if (select status from tools where id = 'abcdabcd-2222-0000-0000-000000000003') <> 'written_off' then
    raise exception 'FAIL: tool not written off';
  end if;
  if (select count(*) from tool_movements
      where tool_id = 'abcdabcd-2222-0000-0000-000000000003' and action = 'write_off') <> 1 then
    raise exception 'FAIL: write_off movement missing';
  end if;
  if (select count(*) from tool_photos
      where tool_id = 'abcdabcd-2222-0000-0000-000000000003' and photo_type = 'damage') <> 1 then
    raise exception 'FAIL: damage photo missing';
  end if;

  begin
    perform write_off_tool('abcdabcd-2222-0000-0000-000000000003', 'broken');
    raise exception 'FAIL: double write-off allowed';
  exception when others then
    if sqlerrm not like '%already_written_off%' then raise; end if;
  end;
end $$;

-- worker cannot write off
set local request.jwt.claims =
  '{"sub":"abcdabcd-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
begin
  begin
    perform write_off_tool('abcdabcd-2222-0000-0000-000000000001', 'broken');
    raise exception 'FAIL: worker wrote off a tool';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- ---------- commissioning helpers ----------
set local request.jwt.claims =
  '{"sub":"abcdabcd-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare comp uuid; insp uuid;
begin
  select add_tool_component('abcdabcd-2222-0000-0000-000000000001', 'Lagaminas', 1, null) into comp;
  if (select count(*) from tool_components
      where tool_id = 'abcdabcd-2222-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: component not added';
  end if;

  select add_inspection_schedule('abcdabcd-2222-0000-0000-000000000001',
                                 'electrical_safety', 12, current_date + 300) into insp;
  -- upsert on same type
  select add_inspection_schedule('abcdabcd-2222-0000-0000-000000000001',
                                 'electrical_safety', 6, current_date + 100) into insp;
  if (select interval_months from inspection_schedules where id = insp) <> 6 then
    raise exception 'FAIL: inspection upsert failed';
  end if;

  perform add_tool_photo('abcdabcd-2222-0000-0000-000000000001', 'x/orig.jpg');
  if (select count(*) from tool_photos
      where tool_id = 'abcdabcd-2222-0000-0000-000000000001' and photo_type = 'original') <> 1 then
    raise exception 'FAIL: original photo missing';
  end if;

  perform remove_tool_component(comp);
  if (select count(*) from tool_components
      where tool_id = 'abcdabcd-2222-0000-0000-000000000001') <> 0 then
    raise exception 'FAIL: component not removed';
  end if;
end $$;

reset role;
rollback;

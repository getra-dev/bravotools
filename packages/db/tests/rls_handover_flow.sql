-- Test: SPEC 2.4 perform_handover (migration 0005).
-- Covers: checkout (act + numbering + tool state), photo requirement,
-- checkin with component diff (missing → lost, returned → ok),
-- idempotency by client movement uuid, cross-org denial.
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('ffffffff-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'foreman@t24.local', now(), now()),
  ('ffffffff-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'receiver@t24.local', now(), now()),
  ('ffffffff-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outsider@t24.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"ffffffff-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t24_ctx as
  select create_organization('T24 Handover Org') as org_id,
         gen_random_uuid() as mov1,
         gen_random_uuid() as mov2;

do $$
declare org uuid;
begin
  select org_id into org from t24_ctx;
  perform invite_member(org, 'receiver@t24.local', 'worker');
end $$;

-- fixtures: tool with two components (as postgres — direct table access)
reset role;
do $$
declare org uuid;
begin
  select org_id into org from t24_ctx;
  insert into tools (id, org_id, name, qr_code, status) values
    ('ffffffff-2222-0000-0000-000000000001', org, 'T24 Hilti', 'T24-QR-1', 'available');
  insert into tool_components (id, org_id, tool_id, name) values
    ('ffffffff-3333-0000-0000-000000000001', org, 'ffffffff-2222-0000-0000-000000000001', 'Lagaminas'),
    ('ffffffff-3333-0000-0000-000000000002', org, 'ffffffff-2222-0000-0000-000000000001', 'Gylio ribotuvas');
end $$;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"ffffffff-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ---------- photo requirement ----------
do $$
declare org uuid; res jsonb;
begin
  select org_id into org from t24_ctx;
  begin
    select perform_handover(jsonb_build_object(
      'tool_id', 'ffffffff-2222-0000-0000-000000000001',
      'action', 'checkout',
      'receiver_profile_id', 'ffffffff-0000-0000-0000-00000000000b',
      'giver_signature_path', 'x/g.json', 'receiver_signature_path', 'x/r.json'
    )) into res;
    raise exception 'FAIL: checkout without photo allowed (org requires photo)';
  exception when others then
    if sqlerrm not like '%photo_required%' then raise; end if;
  end;
end $$;

-- ---------- checkout ----------
do $$
declare org uuid; m1 uuid; res jsonb; this_year text := to_char(now(), 'YYYY');
begin
  select org_id, mov1 into org, m1 from t24_ctx;
  select perform_handover(jsonb_build_object(
    'movement_id', m1,
    'tool_id', 'ffffffff-2222-0000-0000-000000000001',
    'action', 'checkout',
    'receiver_profile_id', 'ffffffff-0000-0000-0000-00000000000b',
    'components', jsonb_build_array(
      jsonb_build_object('component_id', 'ffffffff-3333-0000-0000-000000000001', 'included', true),
      jsonb_build_object('component_id', 'ffffffff-3333-0000-0000-000000000002', 'included', true)),
    'photos', jsonb_build_array(jsonb_build_object('storage_path', org || '/t/1.jpg')),
    'gps_lat', '54.6872', 'gps_lng', '25.2798',
    'giver_signature_path', org || '/acts/g1.json',
    'receiver_signature_path', org || '/acts/r1.json'
  )) into res;

  if res->>'act_number' <> 'BT-AKT-' || this_year || '-0001' then
    raise exception 'FAIL: act number % (expected BT-AKT-%-0001)', res->>'act_number', this_year;
  end if;
  if (select status from tools where id = 'ffffffff-2222-0000-0000-000000000001') <> 'checked_out' then
    raise exception 'FAIL: tool not checked_out after checkout';
  end if;
  if (select current_holder_id from tools where id = 'ffffffff-2222-0000-0000-000000000001')
     <> 'ffffffff-0000-0000-0000-00000000000b' then
    raise exception 'FAIL: holder not set';
  end if;
  if (select count(*) from tool_photos where movement_id = m1) <> 1 then
    raise exception 'FAIL: photo row missing';
  end if;

  -- idempotency: same movement uuid returns the same act, no new rows
  select perform_handover(jsonb_build_object(
    'movement_id', m1,
    'tool_id', 'ffffffff-2222-0000-0000-000000000001',
    'action', 'checkout',
    'receiver_profile_id', 'ffffffff-0000-0000-0000-00000000000b',
    'giver_signature_path', 'x', 'receiver_signature_path', 'x'
  )) into res;
  if (res->>'duplicate')::boolean is not true then
    raise exception 'FAIL: duplicate submit not detected';
  end if;
  if (select count(*) from tool_movements where tool_id = 'ffffffff-2222-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: duplicate created a second movement';
  end if;
end $$;

-- ---------- checkin with missing component ----------
do $$
declare org uuid; m2 uuid; res jsonb;
begin
  select org_id, mov2 into org, m2 from t24_ctx;
  -- return WITHOUT the depth gauge (component 2)
  select perform_handover(jsonb_build_object(
    'movement_id', m2,
    'tool_id', 'ffffffff-2222-0000-0000-000000000001',
    'action', 'checkin',
    'components', jsonb_build_array(
      jsonb_build_object('component_id', 'ffffffff-3333-0000-0000-000000000001', 'included', true),
      jsonb_build_object('component_id', 'ffffffff-3333-0000-0000-000000000002', 'included', false,
                         'condition_note', 'liko objekte')),
    'photos', jsonb_build_array(jsonb_build_object('storage_path', org || '/t/2.jpg')),
    'giver_signature_path', org || '/acts/g2.json',
    'receiver_signature_path', org || '/acts/r2.json'
  )) into res;

  if (select status from tools where id = 'ffffffff-2222-0000-0000-000000000001') <> 'available' then
    raise exception 'FAIL: tool not available after checkin';
  end if;
  if (select current_holder_id from tools where id = 'ffffffff-2222-0000-0000-000000000001') is not null then
    raise exception 'FAIL: holder not cleared after checkin';
  end if;
  if (select status from tool_components where id = 'ffffffff-3333-0000-0000-000000000002') <> 'lost' then
    raise exception 'FAIL: missing component not flagged lost';
  end if;
  if (select status from tool_components where id = 'ffffffff-3333-0000-0000-000000000001') <> 'ok' then
    raise exception 'FAIL: returned component should stay ok';
  end if;
  if res->>'act_number' not like 'BT-AKT-%-0002' then
    raise exception 'FAIL: second act number % (expected -0002)', res->>'act_number';
  end if;
end $$;

-- ---------- outsider denied ----------
set local request.jwt.claims =
  '{"sub":"ffffffff-0000-0000-0000-00000000000c","role":"authenticated"}';

do $$
declare res jsonb;
begin
  begin
    select perform_handover(jsonb_build_object(
      'tool_id', 'ffffffff-2222-0000-0000-000000000001',
      'action', 'checkout',
      'receiver_profile_id', 'ffffffff-0000-0000-0000-00000000000c',
      'photos', jsonb_build_array(jsonb_build_object('storage_path', 'x/1.jpg')),
      'giver_signature_path', 'x', 'receiver_signature_path', 'x'
    )) into res;
    raise exception 'FAIL: outsider performed handover';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

reset role;
rollback;

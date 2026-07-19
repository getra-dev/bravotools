-- Test: SPEC 2.11 act archiving (0014).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('fafafafa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@t211.local', now(), now()),
  ('fafafafa-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t211.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"fafafafa-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t211_ctx as
  select create_organization('T211 Archive Org') as org_id;

do $$
declare org uuid;
begin
  select org_id into org from t211_ctx;
  perform invite_member(org, 'worker@t211.local', 'worker');
end $$;

-- fixtures: an old signed act, a fresh signed act, a pending act
reset role;
do $$
declare org uuid; m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid(); m3 uuid := gen_random_uuid();
begin
  select org_id into org from t211_ctx;
  insert into tools (id, org_id, name, qr_code, status) values
    ('fafafafa-2222-0000-0000-000000000001', org, 'T211 Tool', 'T211-QR-1', 'available');
  insert into tool_movements (id, org_id, tool_id, action, performed_by, performed_at) values
    (m1, org, 'fafafafa-2222-0000-0000-000000000001', 'checkout', 'fafafafa-0000-0000-0000-00000000000a', now() - interval '90 days'),
    (m2, org, 'fafafafa-2222-0000-0000-000000000001', 'checkin',  'fafafafa-0000-0000-0000-00000000000a', now() - interval '1 day'),
    (m3, org, 'fafafafa-2222-0000-0000-000000000001', 'checkout', 'fafafafa-0000-0000-0000-00000000000a', now());
  insert into handover_acts (id, org_id, act_number, movement_id, status, created_at) values
    ('fafafafa-9999-0000-0000-000000000001', org, 'T211-A1', m1, 'signed', now() - interval '90 days'),
    ('fafafafa-9999-0000-0000-000000000002', org, 'T211-A2', m2, 'signed', now() - interval '1 day'),
    ('fafafafa-9999-0000-0000-000000000003', org, 'T211-A3', m3, 'pending_signatures', now() - interval '90 days');
end $$;

set local role authenticated;

-- worker cannot archive
set local request.jwt.claims =
  '{"sub":"fafafafa-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare org uuid; res jsonb;
begin
  select org_id into org from t211_ctx;
  begin
    select archive_acts(org, current_date) into res;
    raise exception 'FAIL: worker archived acts';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- owner archives up to 30 days ago: only the old SIGNED act goes
set local request.jwt.claims =
  '{"sub":"fafafafa-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare org uuid; res jsonb;
begin
  select org_id into org from t211_ctx;
  select archive_acts(org, (current_date - 30)) into res;
  if (res->>'archived')::int <> 1 then
    raise exception 'FAIL: expected 1 archived, got %', res->>'archived';
  end if;
  if (select archived_at from handover_acts where id = 'fafafafa-9999-0000-0000-000000000001') is null then
    raise exception 'FAIL: old signed act not archived';
  end if;
  if (select archived_at from handover_acts where id = 'fafafafa-9999-0000-0000-000000000002') is not null then
    raise exception 'FAIL: fresh act wrongly archived';
  end if;
  if (select archived_at from handover_acts where id = 'fafafafa-9999-0000-0000-000000000003') is not null then
    raise exception 'FAIL: pending act wrongly archived';
  end if;

  -- idempotent rerun archives nothing new
  select archive_acts(org, (current_date - 30)) into res;
  if (res->>'archived')::int <> 0 then
    raise exception 'FAIL: rerun archived % more', res->>'archived';
  end if;
end $$;

reset role;
rollback;

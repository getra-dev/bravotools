-- Test: ADR-015 initiate/countersign (migration 0010).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('cdcdcdcd-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'giver@t30.local', now(), now()),
  ('cdcdcdcd-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'receiver@t30.local', now(), now()),
  ('cdcdcdcd-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'other@t30.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"cdcdcdcd-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t30_ctx as
  select create_organization('T30 Remote Org') as org_id,
         gen_random_uuid() as act1,
         gen_random_uuid() as act2;

do $$
declare org uuid;
begin
  select org_id into org from t30_ctx;
  perform invite_member(org, 'receiver@t30.local', 'worker');
  perform invite_member(org, 'other@t30.local', 'worker');
end $$;

reset role;
do $$
declare org uuid;
begin
  select org_id into org from t30_ctx;
  insert into tools (id, org_id, name, qr_code, status) values
    ('cdcdcdcd-2222-0000-0000-000000000001', org, 'T30 Makita', 'T30-QR-1', 'available');
end $$;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"cdcdcdcd-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ---------- initiate checkout: pending act, tool state, notification ----------
do $$
declare org uuid; a1 uuid; res jsonb;
begin
  select org_id, act1 into org, a1 from t30_ctx;
  select initiate_handover(jsonb_build_object(
    'act_id', a1,
    'tool_id', 'cdcdcdcd-2222-0000-0000-000000000001',
    'action', 'checkout',
    'receiver_profile_id', 'cdcdcdcd-0000-0000-0000-00000000000b',
    'photos', jsonb_build_array(jsonb_build_object('storage_path', org || '/t/1.jpg')),
    'signature_path', org || '/acts/g.json',
    'note', 'perduodu'
  )) into res;

  if (select status from handover_acts where id = a1) <> 'pending_signatures' then
    raise exception 'FAIL: act not pending after initiate';
  end if;
  if (select status from tools where id = 'cdcdcdcd-2222-0000-0000-000000000001') <> 'checked_out' then
    raise exception 'FAIL: tool state not updated at initiate';
  end if;
end $$;

reset role;
do $$
declare a1 uuid;
begin
  select act1 into a1 from t30_ctx;
  if (select count(*) from notifications
      where entity_id = a1 and user_id = 'cdcdcdcd-0000-0000-0000-00000000000b'
        and title like 'Signature requested%') <> 1 then
    raise exception 'FAIL: receiver did not get signature request notification';
  end if;
end $$;

-- ---------- wrong user cannot countersign ----------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"cdcdcdcd-0000-0000-0000-00000000000c","role":"authenticated"}';

do $$
declare a1 uuid; res jsonb;
begin
  select act1 into a1 from t30_ctx;
  begin
    select countersign_handover(a1, 'x/r.json') into res;
    raise exception 'FAIL: wrong user countersigned';
  exception when others then
    if sqlerrm not like '%not_your_signature%' then raise; end if;
  end;
end $$;

-- ---------- receiver countersigns in own session ----------
set local request.jwt.claims =
  '{"sub":"cdcdcdcd-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare org uuid; a1 uuid; res jsonb;
begin
  select org_id, act1 into org, a1 from t30_ctx;
  select countersign_handover(a1, org || '/acts/r.json', 'priimu') into res;
  if res->>'status' <> 'signed' then
    raise exception 'FAIL: act not signed after countersign (%)', res->>'status';
  end if;
  if (select count(*) from comments where entity_id = a1 and body = 'priimu') <> 1 then
    raise exception 'FAIL: countersign note missing';
  end if;
end $$;

reset role;
do $$
declare a1 uuid;
begin
  select act1 into a1 from t30_ctx;
  if (select count(*) from notifications
      where entity_id = a1 and user_id = 'cdcdcdcd-0000-0000-0000-00000000000a'
        and title like 'Act signed%') <> 1 then
    raise exception 'FAIL: initiator not notified about completion';
  end if;
end $$;

-- ---------- return: holder initiates, supply side countersigns ----------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"cdcdcdcd-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare org uuid; a2 uuid; res jsonb;
begin
  select org_id, act2 into org, a2 from t30_ctx;
  select initiate_handover(jsonb_build_object(
    'act_id', a2,
    'tool_id', 'cdcdcdcd-2222-0000-0000-000000000001',
    'action', 'checkin',
    'photos', jsonb_build_array(jsonb_build_object('storage_path', org || '/t/2.jpg')),
    'signature_path', org || '/acts/g2.json'
  )) into res;
  if (select status from tools where id = 'cdcdcdcd-2222-0000-0000-000000000001') <> 'available' then
    raise exception 'FAIL: tool not available after return initiate';
  end if;
end $$;

-- worker (not supply) cannot countersign the return
set local request.jwt.claims =
  '{"sub":"cdcdcdcd-0000-0000-0000-00000000000c","role":"authenticated"}';
do $$
declare a2 uuid; res jsonb;
begin
  select act2 into a2 from t30_ctx;
  begin
    select countersign_handover(a2, 'x.json') into res;
    raise exception 'FAIL: plain worker countersigned a return';
  exception when others then
    if sqlerrm not like '%not_your_signature%' then raise; end if;
  end;
end $$;

-- owner (supply side) countersigns receipt
set local request.jwt.claims =
  '{"sub":"cdcdcdcd-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare org uuid; a2 uuid; res jsonb;
begin
  select org_id, act2 into org, a2 from t30_ctx;
  select countersign_handover(a2, org || '/acts/r2.json') into res;
  if res->>'status' <> 'signed' then
    raise exception 'FAIL: return act not signed (%)', res->>'status';
  end if;
  if (select receiver_id from handover_acts where id = a2)
     <> 'cdcdcdcd-0000-0000-0000-00000000000a' then
    raise exception 'FAIL: supply countersigner not recorded as receiver';
  end if;
end $$;

reset role;
rollback;

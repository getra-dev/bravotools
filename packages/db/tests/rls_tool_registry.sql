-- Test: SPEC 2.3 tool CRUD RPCs + detail read policies (migration 0004).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('eeeeeeee-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'editor@t23.local', now(), now()),
  ('eeeeeeee-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t23.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"eeeeeeee-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t23_ctx as
  select create_organization('T23 Registry Org') as org_id;

-- ---------- create + qr numbering + update ----------
do $$
declare org uuid; tid uuid; qr text;
begin
  select org_id into org from t23_ctx;

  select create_tool(org, '{"name":"Hilti TE 60","purchase_price":"1 890,50","warranty_months":"24","purchase_date":"2026-01-10"}'::jsonb) into tid;
  select qr_code into qr from tools where id = tid;
  if qr !~ '^BT-TOOL-[0-9]{6}$' then
    raise exception 'FAIL: create_tool qr format % broken', qr;
  end if;
  if (select purchase_price from tools where id = tid) <> 1890.50 then
    raise exception 'FAIL: LT price not parsed on create';
  end if;
  if (select warranty_until from tools where id = tid) <> date '2028-01-10' then
    raise exception 'FAIL: warranty_until not generated';
  end if;

  perform update_tool(tid, '{"name":"Hilti TE 60-AVR","purchase_price":"1900","warranty_months":"24","purchase_date":"2026-01-10"}'::jsonb);
  if (select name from tools where id = tid) <> 'Hilti TE 60-AVR' then
    raise exception 'FAIL: update_tool did not update name';
  end if;

  if (select count(*) from activity_log where entity_id = tid) < 2 then
    raise exception 'FAIL: activity_log entries missing for tool CRUD';
  end if;

  -- second tool gets the next number, no collisions
  perform create_tool(org, '{"name":"Makita DHP486"}'::jsonb);
  if (select count(distinct qr_code) from tools where org_id = org) <> 2 then
    raise exception 'FAIL: duplicate qr within org';
  end if;
end $$;

-- ---------- worker: can read, cannot create/update ----------
reset role;
do $$
declare org uuid;
begin
  select org_id into org from t23_ctx;
  insert into memberships (org_id, user_id, role)
  values (org, 'eeeeeeee-0000-0000-0000-00000000000b', 'worker');
end $$;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"eeeeeeee-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare org uuid; n integer; tid uuid;
begin
  select org_id into org from t23_ctx;
  select count(*) into n from tools where org_id = org;
  if n <> 2 then
    raise exception 'FAIL: worker cannot read org tools (%)', n;
  end if;

  begin
    select create_tool(org, '{"name":"Sneaky"}'::jsonb) into tid;
    raise exception 'FAIL: worker created a tool';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;

  select id into tid from tools where org_id = org limit 1;
  begin
    perform update_tool(tid, '{"name":"Hacked"}'::jsonb);
    raise exception 'FAIL: worker updated a tool';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- ---------- detail reads: seeded Sivysta movements/components visible to its members ----------
set local request.jwt.claims =
  '{"sub":"00000000-0000-0000-0001-000000000001","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from tool_movements;
  if n = 0 then raise exception 'FAIL: org member sees no movements'; end if;
  select count(*) into n from handover_acts;
  if n = 0 then raise exception 'FAIL: org member sees no acts'; end if;
  select count(*) into n from locations;
  if n = 0 then raise exception 'FAIL: org member sees no locations'; end if;
  select count(*) into n from external_persons;
  if n = 0 then raise exception 'FAIL: org member sees no external persons'; end if;
end $$;

-- ---------- outsider isolation for the same tables ----------
set local request.jwt.claims =
  '{"sub":"eeeeeeee-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from tool_movements;
  if n <> 0 then raise exception 'FAIL: outsider sees % movements', n; end if;
  select count(*) into n from locations;
  if n <> 0 then raise exception 'FAIL: outsider sees % locations', n; end if;
end $$;

reset role;
rollback;

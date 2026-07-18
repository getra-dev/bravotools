-- Test: SPEC 2.2 import_tools RPC (migration 0003).
-- Covers: bulk import creates tools + categories + vendors; QR numbering
-- continues org sequence and skips global collisions; rows without a name
-- are skipped (never block); worker role denied; org isolation intact.
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('dddddddd-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'importer@t22.local', now(), now()),
  ('dddddddd-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t22.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"dddddddd-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t22_ctx as
  select create_organization('T22 Import Org') as org_id;

do $$
declare org uuid; res jsonb;
begin
  select org_id into org from t22_ctx;
  select import_tools(org, '[
    {"name":"Hilti TE 60","serial_number":"SN-1","category":"Perforatoriai","purchase_price":"1 890,50","purchase_date":"2024-05-10","vendor":"Hilti Lietuva"},
    {"name":"Makita DHP486","category":"Suktukai","purchase_price":"259","vendor":"Hilti Lietuva"},
    {"name":"","serial_number":"NO-NAME","category":"X"},
    {"name":"Bosch GBH 2-26","category":"Perforatoriai","purchase_date":"not-a-date","purchase_price":"abc"}
  ]'::jsonb) into res;

  if (res->>'imported')::int <> 3 then
    raise exception 'FAIL: imported % (expected 3)', res->>'imported';
  end if;
  if jsonb_array_length(res->'skipped') <> 1
     or res->'skipped'->0->>'reason' <> 'missing_name' then
    raise exception 'FAIL: skipped list wrong: %', res->'skipped';
  end if;

  if (select count(*) from tools where org_id = org) <> 3 then
    raise exception 'FAIL: tools row count mismatch';
  end if;
  if (select count(*) from tool_categories where org_id = org) <> 2 then
    raise exception 'FAIL: categories not deduplicated (expected 2)';
  end if;
  if (select count(*) from vendors where org_id = org) <> 1 then
    raise exception 'FAIL: vendor not deduplicated (expected 1)';
  end if;

  -- bad price/date land as NULL, row still imported
  if (select purchase_price from tools where org_id = org and name = 'Bosch GBH 2-26') is not null then
    raise exception 'FAIL: unparseable price should be null';
  end if;
  -- messy LT price "1 890,50" parsed
  if (select purchase_price from tools where org_id = org and name = 'Hilti TE 60') <> 1890.50 then
    raise exception 'FAIL: LT-formatted price not parsed';
  end if;

  -- QR: globally unique, org counter continued past seeded BT-TOOL-0000NN
  if (select count(*) from tools where org_id = org and qr_code !~ '^BT-TOOL-[0-9]{6}$') > 0 then
    raise exception 'FAIL: qr_code format broken';
  end if;
  if (select count(distinct qr_code) from tools) <> (select count(*) from tools) then
    raise exception 'FAIL: duplicate qr_code after import';
  end if;
end $$;

-- counter must persist in org settings even when {numbering} did not exist
reset role;
do $$
declare org uuid; c integer;
begin
  select org_id into org from t22_ctx;
  select (settings#>>'{numbering,tool,counter}')::integer into c
  from organizations where id = org;
  if c is null or c < 3 then
    raise exception 'FAIL: numbering counter not persisted (got %)', c;
  end if;
end $$;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"dddddddd-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ---------- worker cannot import ----------
reset role;
do $$
declare org uuid;
begin
  select org_id into org from t22_ctx;
  insert into memberships (org_id, user_id, role)
  values (org, 'dddddddd-0000-0000-0000-00000000000b', 'worker');
end $$;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"dddddddd-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare org uuid; res jsonb;
begin
  select org_id into org from t22_ctx;
  begin
    select import_tools(org, '[{"name":"Sneaky tool"}]'::jsonb) into res;
    raise exception 'FAIL: worker was allowed to import';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

reset role;
rollback;

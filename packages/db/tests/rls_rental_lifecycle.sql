-- Test: SPEC 2.10 rental intake + return to vendor (0013).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('cececece-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@t210.local', now(), now()),
  ('cececece-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t210.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"cececece-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t210_ctx as
  select create_organization('T210 Rental Org') as org_id;

do $$
declare org uuid;
begin
  select org_id into org from t210_ctx;
  perform invite_member(org, 'worker@t210.local', 'worker');
end $$;

reset role;
do $$
declare org uuid;
begin
  select org_id into org from t210_ctx;
  insert into vendors (id, org_id, name, type) values
    ('cececece-5555-0000-0000-000000000001', org, 'T210 Cramo', '{rental}');
  insert into locations (org_id, type, vendor_id, name) values
    (org, 'vendor', 'cececece-5555-0000-0000-000000000001', 'T210 Cramo punktas');
end $$;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"cececece-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ---------- intake ----------
create temporary table t210_tool as select null::uuid as tool_id;
do $$
declare org uuid; res jsonb;
begin
  select org_id into org from t210_ctx;

  begin
    select rental_intake(jsonb_build_object(
      'vendor_id', 'cececece-5555-0000-0000-000000000001',
      'name', 'T210 Manitou', 'photos', '[]'::jsonb)) into res;
    raise exception 'FAIL: intake without photos allowed';
  exception when others then
    if sqlerrm not like '%photo_required%' then raise; end if;
  end;

  select rental_intake(jsonb_build_object(
    'vendor_id', 'cececece-5555-0000-0000-000000000001',
    'name', 'T210 Manitou',
    'rental_rate_daily', '145,50',
    'rental_due_return', (current_date + 7)::text,
    'engine_hours', '1200,5',
    'photos', jsonb_build_array(jsonb_build_object('storage_path', org || '/t/i1.jpg'))
  )) into res;

  update t210_tool set tool_id = (res->>'tool_id')::uuid;
  if res->>'qr_code' !~ '^BT-TOOL-[0-9]{6}$' then
    raise exception 'FAIL: intake qr % malformed', res->>'qr_code';
  end if;
end $$;

do $$
declare tid uuid;
begin
  select tool_id into tid from t210_tool;
  if (select ownership from tools where id = tid) <> 'rented'
     or (select status from tools where id = tid) <> 'checked_out'
     or (select rental_rate_daily from tools where id = tid) <> 145.50
     or (select engine_hours from tools where id = tid) <> 1200.5
     or (select tracks_engine_hours from tools where id = tid) is not true then
    raise exception 'FAIL: intake tool fields wrong';
  end if;
  if (select count(*) from tool_photos where tool_id = tid and photo_type = 'original') <> 1 then
    raise exception 'FAIL: intake baseline photo missing';
  end if;
  if (select count(*) from tool_movements where tool_id = tid and action = 'checkout') <> 1 then
    raise exception 'FAIL: pickup movement missing';
  end if;
end $$;

-- worker cannot intake
set local request.jwt.claims =
  '{"sub":"cececece-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare res jsonb; org uuid;
begin
  select org_id into org from t210_ctx;
  begin
    select rental_intake(jsonb_build_object(
      'vendor_id', 'cececece-5555-0000-0000-000000000001', 'name', 'X',
      'photos', jsonb_build_array(jsonb_build_object('storage_path', 'x.jpg')))) into res;
    raise exception 'FAIL: worker performed intake';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- ---------- return to vendor (worker CAN return) ----------
do $$
declare tid uuid; org uuid; res jsonb; vendor_loc uuid;
begin
  select tool_id into tid from t210_tool;
  select org_id into org from t210_ctx;

  select return_to_vendor(jsonb_build_object(
    'tool_id', tid,
    'engine_hours', '1234',
    'note', 'grazinta pilna',
    'photos', jsonb_build_array(jsonb_build_object('storage_path', org || '/t/r1.jpg'))
  )) into res;

  if (select status from tools where id = tid) <> 'returned_to_vendor' then
    raise exception 'FAIL: status not returned_to_vendor';
  end if;
  select id into vendor_loc from locations where org_id = org and type = 'vendor' limit 1;
  if (select current_location_id from tools where id = tid) <> vendor_loc then
    raise exception 'FAIL: tool not moved to vendor location';
  end if;
  if (select to_location_id from tool_movements where id = (res->>'movement_id')::uuid)
     <> vendor_loc then
    raise exception 'FAIL: return movement target wrong';
  end if;

  begin
    select return_to_vendor(jsonb_build_object(
      'tool_id', tid,
      'photos', jsonb_build_array(jsonb_build_object('storage_path', 'x.jpg')))) into res;
    raise exception 'FAIL: double return allowed';
  exception when others then
    if sqlerrm not like '%already_returned%' then raise; end if;
  end;
end $$;

-- supply group notified
reset role;
do $$
declare tid uuid; n integer;
begin
  select tool_id into tid from t210_tool;
  select count(*) into n from notifications
  where entity_id = tid and title like 'Rental returned%'
    and user_id = 'cececece-0000-0000-0000-00000000000a';
  if n <> 1 then raise exception 'FAIL: supply not notified about return (%)', n; end if;
end $$;

rollback;

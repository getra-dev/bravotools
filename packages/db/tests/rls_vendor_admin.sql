-- Test: E2 vendor admin (0020).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('efefefef-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@t6.local', now(), now()),
  ('efefefef-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t6.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"efefefef-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t6_ctx as
  select create_organization('T6 Vendor Org') as org_id;

do $$
declare org uuid;
begin
  select org_id into org from t6_ctx;
  perform invite_member(org, 'worker@t6.local', 'worker');
end $$;

-- worker cannot create a vendor
set local request.jwt.claims =
  '{"sub":"efefefef-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare org uuid;
begin
  select org_id into org from t6_ctx;
  begin
    perform create_vendor(org, jsonb_build_object('name', 'Blocked Co'));
    raise exception 'FAIL: worker created a vendor';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- supply creates + updates
set local request.jwt.claims =
  '{"sub":"efefefef-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare org uuid; vid uuid;
begin
  select org_id into org from t6_ctx;

  -- name required
  begin
    perform create_vendor(org, jsonb_build_object('name', '   '));
    raise exception 'FAIL: blank name allowed';
  exception when others then
    if sqlerrm not like '%name_required%' then raise; end if;
  end;

  -- invalid method rejected
  begin
    perform create_vendor(org, jsonb_build_object('name', 'X', 'order_method', 'carrier_pigeon'));
    raise exception 'FAIL: bad method allowed';
  exception when others then
    if sqlerrm not like '%invalid_method%' then raise; end if;
  end;

  select create_vendor(org, jsonb_build_object(
    'name', 'Naujas Tiekejas UAB',
    'email', 'sales@nt.lt',
    'order_method', 'email',
    'type', jsonb_build_array('materials', 'rental'),
    'default_lead_time_days', '7')) into vid;

  if (select name from vendors where id = vid) <> 'Naujas Tiekejas UAB' then
    raise exception 'FAIL: vendor not created';
  end if;
  if (select array_length(type, 1) from vendors where id = vid) <> 2 then
    raise exception 'FAIL: types not stored';
  end if;
  if (select default_lead_time_days from vendors where id = vid) <> 7 then
    raise exception 'FAIL: lead time not stored';
  end if;

  perform update_vendor(vid, jsonb_build_object(
    'name', 'Naujas Tiekejas UAB',
    'email', 'orders@nt.lt',
    'order_method', 'csv',
    'type', jsonb_build_array('materials')));
  if (select email from vendors where id = vid) <> 'orders@nt.lt' then
    raise exception 'FAIL: update did not apply';
  end if;
  if (select order_method from vendors where id = vid) <> 'csv' then
    raise exception 'FAIL: method not updated';
  end if;
end $$;

-- worker cannot update either
set local request.jwt.claims =
  '{"sub":"efefefef-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare org uuid; vid uuid;
begin
  select org_id into org from t6_ctx;
  select id into vid from vendors where org_id = org limit 1;
  begin
    perform update_vendor(vid, jsonb_build_object('name', 'Hacked'));
    raise exception 'FAIL: worker updated a vendor';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

reset role;
rollback;

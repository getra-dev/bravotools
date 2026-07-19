-- Test: E2 per-line ETA (0025).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('c3c3c3c3-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@ta.local', now(), now()),
  ('c3c3c3c3-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@ta.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"c3c3c3c3-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table ta as select create_organization('TA ETA Org') as org_id;

do $$
declare org uuid; mid uuid; vid uuid; site uuid; rid uuid; item uuid;
begin
  select org_id into org from ta;
  perform invite_member(org, 'worker@ta.local', 'worker');
  select create_material(org, 'EPS 50mm', 'vnt', 'siltinimas', 'order') into mid;
  -- vendor with a 30-day default lead, catalog gives this material 7 days
  select create_vendor(org, jsonb_build_object('name', 'Lead Vendor', 'email', 'l@v.lt',
    'default_lead_time_days', '30')) into vid;
  perform set_vendor_price(jsonb_build_object(
    'material_id', mid, 'vendor_id', vid, 'price', '9', 'lead_time_days', '7'));
  select create_location(org, '{"name":"TA Objektas","type":"site"}'::jsonb) into site;

  select create_material_request(jsonb_build_object(
    'site_id', site,
    'items', jsonb_build_array(jsonb_build_object('raw_text', 'eps 20', 'qty', '20')))) into rid;
  select id into item from material_request_items where request_id = rid limit 1;
  perform confirm_material_match(item, mid, 20, 'vnt');
end $$;

-- order: catalog lead (7) wins over vendor default (30) → expected_date = today+7
create temporary table ta_line as select null::uuid as line_id;
grant select on ta_line to authenticated;
do $$
declare org uuid; rid uuid; res jsonb; li uuid; d date;
begin
  select org_id into org from ta;
  select id into rid from material_requests where org_id = org limit 1;
  select create_order_from_request(rid, (select id from vendors where org_id = org limit 1)) into res;

  select id, expected_date into li, d from order_items
  where order_id = (res->>'order_id')::uuid limit 1;
  update ta_line set line_id = li;

  if d <> current_date + 7 then
    raise exception 'FAIL: expected_date not defaulted from catalog lead (got %)', d;
  end if;
  if (select material_id from order_items where id = li) is null then
    raise exception 'FAIL: material_id not stamped on order line';
  end if;

  -- dispatcher overrides the ETA
  perform set_order_line_eta(li, (current_date + 3)::text);
  if (select expected_date from order_items where id = li) <> current_date + 3 then
    raise exception 'FAIL: ETA override did not apply';
  end if;
end $$;

-- worker cannot override an ETA
set local request.jwt.claims =
  '{"sub":"c3c3c3c3-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare li uuid;
begin
  select line_id into li from ta_line;
  begin
    perform set_order_line_eta(li, (current_date + 1)::text);
    raise exception 'FAIL: worker set an ETA';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

reset role;
rollback;

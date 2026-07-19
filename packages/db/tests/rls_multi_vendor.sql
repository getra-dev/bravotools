-- Test: E2 multi-vendor split + shortfall re-order (0026).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('d4d4d4d4-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@tb.local', now(), now()),
  ('d4d4d4d4-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@tb.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"d4d4d4d4-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table tb as select create_organization('TB Split Org') as org_id;

create temporary table tb_ids as
  select null::uuid as m1, null::uuid as m2, null::uuid as v1, null::uuid as v2,
         null::uuid as site, null::uuid as rid, null::uuid as item1, null::uuid as item2;

do $$
declare l_org uuid; l_m1 uuid; l_m2 uuid; l_v1 uuid; l_v2 uuid; l_site uuid; l_rid uuid; l_i1 uuid; l_i2 uuid;
begin
  select org_id into l_org from tb;
  perform invite_member(l_org, 'worker@tb.local', 'worker');
  select create_material(l_org, 'Mūro blokelis', 'vnt', 'mūras', 'order') into l_m1;
  select create_material(l_org, 'Akmens vata', 'pak', 'šiltinimas', 'order') into l_m2;
  select create_vendor(l_org, jsonb_build_object('name','Blokelių tiekėjas','email','a@a.lt','default_lead_time_days','4')) into l_v1;
  select create_vendor(l_org, jsonb_build_object('name','Vatos tiekėjas','email','b@b.lt','default_lead_time_days','10')) into l_v2;
  select create_location(l_org, '{"name":"TB Objektas","type":"site"}'::jsonb) into l_site;

  select create_material_request(jsonb_build_object('site_id', l_site,
    'items', jsonb_build_array(
      jsonb_build_object('raw_text','blokeliu 100','qty','100'),
      jsonb_build_object('raw_text','vatos 20','qty','20')))) into l_rid;
  select id into l_i1 from material_request_items where request_id = l_rid and raw_text like 'blokeliu%';
  select id into l_i2 from material_request_items where request_id = l_rid and raw_text like 'vatos%';
  perform confirm_material_match(l_i1, l_m1, 100, 'vnt');
  perform confirm_material_match(l_i2, l_m2, 20, 'pak');

  update tb_ids set m1=l_m1, m2=l_m2, v1=l_v1, v2=l_v2, site=l_site, rid=l_rid, item1=l_i1, item2=l_i2;
end $$;

-- D: split → blocks to v1, wool to v2 = TWO orders
do $$
declare l_rid uuid; l_v1 uuid; l_v2 uuid; l_i1 uuid; l_i2 uuid; res jsonb;
begin
  select rid, v1, v2, item1, item2 into l_rid, l_v1, l_v2, l_i1, l_i2 from tb_ids;

  -- unassigned line rejected
  begin
    perform create_orders_split(l_rid, jsonb_build_array(
      jsonb_build_object('item_id', l_i1, 'vendor_id', l_v1)));
    raise exception 'FAIL: split allowed an unassigned line';
  exception when others then
    if sqlerrm not like '%line_unassigned%' then raise; end if;
  end;

  select create_orders_split(l_rid, jsonb_build_array(
    jsonb_build_object('item_id', l_i1, 'vendor_id', l_v1),
    jsonb_build_object('item_id', l_i2, 'vendor_id', l_v2))) into res;

  if (res->>'count')::int <> 2 then raise exception 'FAIL: expected 2 orders, got %', res->>'count'; end if;
  -- each order has exactly one line, correct vendor
  if (select count(*) from orders where vendor_id = l_v1 and status='requested') <> 1 then
    raise exception 'FAIL: v1 order missing'; end if;
  if (select count(*) from orders where vendor_id = l_v2 and status='requested') <> 1 then
    raise exception 'FAIL: v2 order missing'; end if;
  if (select status from material_requests where id = l_rid) <> 'ordered' then
    raise exception 'FAIL: request not ordered'; end if;
end $$;

-- E: the v1 blocks order comes short → re-order remainder from v2
create temporary table tb_line as select null::uuid as item_id, null::uuid as order_id;
grant select on tb_line to authenticated;
do $$
declare l_v1 uuid; l_v2 uuid; oid uuid; li uuid; res jsonb;
begin
  select v1, v2 into l_v1, l_v2 from tb_ids;
  select id into oid from orders where vendor_id = l_v1 limit 1;
  select id into li from order_items where order_id = oid limit 1;
  update tb_line set item_id = li, order_id = oid;

  -- receive 60 of 100, short 40 with an issue
  perform receive_order(jsonb_build_object('order_id', oid, 'lines', jsonb_build_array(
    jsonb_build_object('item_id', li, 'received_qty', '60',
                       'issue_type', 'short_qty', 'issue_qty', '40'))));

  -- re-order the 40 remainder from v2
  select reorder_shortfall(jsonb_build_object('order_item_id', li, 'vendor_id', l_v2)) into res;
  if (res->>'order_id') is null then raise exception 'FAIL: no reorder created'; end if;
  if (select quantity from order_items where order_id = (res->>'order_id')::uuid) <> 40 then
    raise exception 'FAIL: reorder qty not the remainder';
  end if;
  if (select vendor_id from orders where id = (res->>'order_id')::uuid) <> l_v2 then
    raise exception 'FAIL: reorder went to wrong vendor';
  end if;
  -- original issue flipped to redelivery
  if (select status from delivery_issues where order_item_id = li) <> 'redelivery' then
    raise exception 'FAIL: issue not marked redelivery';
  end if;
end $$;

-- worker cannot split or reorder
set local request.jwt.claims =
  '{"sub":"d4d4d4d4-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare li uuid; l_v2 uuid;
begin
  select item_id into li from tb_line;
  select v2 into l_v2 from tb_ids;
  begin
    perform reorder_shortfall(jsonb_build_object('order_item_id', li, 'vendor_id', l_v2));
    raise exception 'FAIL: worker reordered';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

reset role;
rollback;

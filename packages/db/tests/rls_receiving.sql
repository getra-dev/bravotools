-- Test: E2-C receiving (0018).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('cdcdcdcd-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@t4.local', now(), now()),
  ('cdcdcdcd-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'foreman@t4.local', now(), now()),
  ('cdcdcdcd-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@t4.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"cdcdcdcd-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t4_ctx as
  select create_organization('T4 Receiving Org') as org_id;

do $$
declare org uuid; site uuid;
begin
  select org_id into org from t4_ctx;
  perform invite_member(org, 'foreman@t4.local', 'site_manager');
  perform invite_member(org, 'stranger@t4.local', 'worker');
  select create_location(org, '{"name":"T4 Objektas","type":"site"}'::jsonb) into site;
  perform assign_site_member(site, 'cdcdcdcd-0000-0000-0000-00000000000b', true);
end $$;

-- seed an ordered order with two lines (as postgres — the pipeline path
-- is covered by rls_supply_requests)
reset role;
create temporary table t4_order as select null::uuid as order_id;
do $$
declare org uuid; site uuid; oid uuid;
begin
  select org_id into org from t4_ctx;
  select id into site from locations where org_id = org and type = 'site' limit 1;
  insert into orders (org_id, order_number, site_id, status, requested_by)
  values (org, 'BT-T4-0001', site, 'ordered', 'cdcdcdcd-0000-0000-0000-00000000000a')
  returning id into oid;
  update t4_order set order_id = oid;
  insert into order_items (order_id, description, quantity, unit) values
    (oid, 'Cementas 25kg', 40, 'vnt'),
    (oid, 'Armatura 12mm', 25, 'vnt');
end $$;
grant select on t4_order to authenticated;
set local role authenticated;

-- ---------- stranger (unassigned) cannot receive ----------
set local request.jwt.claims =
  '{"sub":"cdcdcdcd-0000-0000-0000-00000000000c","role":"authenticated"}';
do $$
declare oid uuid; res jsonb;
begin
  select order_id into oid from t4_order;
  begin
    select receive_order(jsonb_build_object('order_id', oid, 'lines', '[]'::jsonb)) into res;
    raise exception 'FAIL: stranger received an order';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- ---------- foreman: partial receive with a shortage ----------
set local request.jwt.claims =
  '{"sub":"cdcdcdcd-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare
  oid uuid; cement uuid; rebar uuid; res jsonb;
begin
  select order_id into oid from t4_order;
  select id into cement from order_items where order_id = oid and description like 'Cementas%';
  select id into rebar from order_items where order_id = oid and description like 'Armatura%';

  -- cement short by 10, rebar in full
  select receive_order(jsonb_build_object(
    'order_id', oid,
    'lines', jsonb_build_array(
      jsonb_build_object('item_id', cement, 'received_qty', '30',
                         'issue_type', 'short_qty', 'issue_qty', '10',
                         'issue_note', 'truksta 10 maisu'),
      jsonb_build_object('item_id', rebar, 'received_qty', '25')))) into res;

  if res->>'status' <> 'partially_delivered' then
    raise exception 'FAIL: expected partially_delivered, got %', res->>'status';
  end if;
  if (select delivered_quantity from order_items where id = cement) <> 30 then
    raise exception 'FAIL: delivered_quantity wrong';
  end if;
  if (select count(*) from delivery_issues
      where order_item_id = cement and issue_type = 'short_qty' and qty_affected = 10) <> 1 then
    raise exception 'FAIL: delivery issue missing';
  end if;

  -- second delivery closes the order (accumulates)
  select receive_order(jsonb_build_object(
    'order_id', oid,
    'lines', jsonb_build_array(
      jsonb_build_object('item_id', cement, 'received_qty', '10')))) into res;
  if res->>'status' <> 'delivered' then
    raise exception 'FAIL: expected delivered after top-up, got %', res->>'status';
  end if;

  -- closed order refuses further receiving
  begin
    select receive_order(jsonb_build_object(
      'order_id', oid,
      'lines', jsonb_build_array(
        jsonb_build_object('item_id', cement, 'received_qty', '1')))) into res;
    raise exception 'FAIL: received on closed order';
  exception when others then
    if sqlerrm not like '%order_closed%' then raise; end if;
  end;
end $$;

-- ---------- supply got notified about the shortage ----------
set local request.jwt.claims =
  '{"sub":"cdcdcdcd-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare org uuid; n integer;
begin
  select org_id into org from t4_ctx;
  select count(*) into n from notifications
  where org_id = org and type = 'delivery_issue'
    and user_id = 'cdcdcdcd-0000-0000-0000-00000000000a';
  if n <> 1 then raise exception 'FAIL: supply notification count % (want 1)', n; end if;
  -- supply sees the issue row through RLS
  select count(*) into n from delivery_issues where org_id = org;
  if n <> 1 then raise exception 'FAIL: supply cannot read issues (%)', n; end if;
end $$;

reset role;
rollback;

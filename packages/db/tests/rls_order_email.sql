-- Test: E2-D order email proof chain (0019).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('dededede-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@t5.local', now(), now()),
  ('dededede-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t5.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"dededede-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t5_ctx as
  select create_organization('T5 Email Org') as org_id;

do $$
declare org uuid;
begin
  select org_id into org from t5_ctx;
  perform invite_member(org, 'worker@t5.local', 'worker');
  perform create_location(org, '{"name":"T5 Objektas","type":"site"}'::jsonb);
end $$;

reset role;
create temporary table t5_order as select null::uuid as order_id;
do $$
declare org uuid; oid uuid; site uuid;
begin
  select org_id into org from t5_ctx;
  select id into site from locations where org_id = org and type = 'site' limit 1;
  insert into orders (org_id, order_number, site_id, status, requested_by)
  values (org, 'BT-T5-0001', site, 'approved', 'dededede-0000-0000-0000-00000000000a')
  returning id into oid;
  update t5_order set order_id = oid;
  insert into order_items (order_id, description, quantity, unit) values
    (oid, 'Test line', 5, 'vnt');
end $$;
grant select on t5_order to authenticated;
set local role authenticated;

-- worker cannot record a send
set local request.jwt.claims =
  '{"sub":"dededede-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare oid uuid;
begin
  select order_id into oid from t5_order;
  begin
    perform record_order_sent(jsonb_build_object(
      'order_id', oid, 'to_address', 'x@vendor.lt', 'subject', 'hi'));
    raise exception 'FAIL: worker recorded a send';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
  -- worker cannot read the proof rows either
  if (select count(*) from outbound_messages) <> 0 then
    raise exception 'FAIL: worker sees outbound messages';
  end if;
end $$;

-- supply records the send → order becomes ordered, proof row visible
set local request.jwt.claims =
  '{"sub":"dededede-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare org uuid; oid uuid; res jsonb;
begin
  select org_id into org from t5_ctx;
  select order_id into oid from t5_order;

  select record_order_sent(jsonb_build_object(
    'order_id', oid, 'to_address', 'b2b@vendor.lt',
    'subject', 'Uzsakymas BT-T5-0001', 'provider_message_id', 'msg-123',
    'body_storage_path', org || '/BT-T5-0001.pdf')) into res;

  if (res->>'message_id') is null then raise exception 'FAIL: no message id'; end if;
  if (select status from orders where id = oid) <> 'ordered' then
    raise exception 'FAIL: order not moved to ordered';
  end if;
  if (select confirmed_at from orders where id = oid) is null then
    raise exception 'FAIL: confirmed_at not set';
  end if;
  if (select count(*) from outbound_messages
      where entity_id = oid and status = 'sent' and to_address = 'b2b@vendor.lt') <> 1 then
    raise exception 'FAIL: proof row missing';
  end if;
  if (select count(*) from activity_log
      where entity_id = oid and action = 'email_sent') <> 1 then
    raise exception 'FAIL: activity not logged';
  end if;

  -- resending is allowed and just adds another proof row (already ordered)
  perform record_order_sent(jsonb_build_object(
    'order_id', oid, 'to_address', 'b2b@vendor.lt', 'subject', 'resend'));
  if (select count(*) from outbound_messages where entity_id = oid) <> 2 then
    raise exception 'FAIL: resend proof not added';
  end if;
end $$;

reset role;
rollback;

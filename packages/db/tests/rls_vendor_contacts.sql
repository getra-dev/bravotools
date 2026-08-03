-- Test: SPEC 3.6 Vendor 360 — vendor contacts + PO routing (0033).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('c0c0c0c0-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@t26.local', now(), now()),
  ('c0c0c0c0-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t26.local', now(), now()),
  ('c0c0c0c0-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outsider@t26.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"c0c0c0c0-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t26_ctx as
  select create_organization('T26 Contacts Org') as org_id;

do $$
declare org uuid;
begin
  select org_id into org from t26_ctx;
  perform invite_member(org, 'worker@t26.local', 'worker');
  perform create_location(org, '{"name":"T26 Objektas","type":"site"}'::jsonb);
  perform create_vendor(org, jsonb_build_object(
    'name', 'T26 Tiekejas', 'email', 'info@t26vendor.lt', 'order_method', 'email'));
  perform create_material(org, 'T26 Blokeliai', 'vnt', 'muras', 'order');
  perform create_material(org, 'T26 Akmens vata', 'm2', 'siltinimas', 'order');
end $$;

-- ---------- write path is supply-only ----------
set local request.jwt.claims =
  '{"sub":"c0c0c0c0-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare org uuid; vid uuid;
begin
  select org_id into org from t26_ctx;
  select id into vid from vendors where org_id = org limit 1;
  begin
    perform create_vendor_contact(jsonb_build_object('vendor_id', vid, 'name', 'Blocked'));
    raise exception 'FAIL: worker created a contact';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- ---------- supply creates contacts ----------
set local request.jwt.claims =
  '{"sub":"c0c0c0c0-0000-0000-0000-00000000000a","role":"authenticated"}';
create temporary table t26_contacts as
  select null::uuid as murininkas, null::uuid as bendras;

do $$
declare org uuid; vid uuid; c1 uuid; c2 uuid;
begin
  select org_id into org from t26_ctx;
  select id into vid from vendors where org_id = org limit 1;

  -- blank name rejected
  begin
    perform create_vendor_contact(jsonb_build_object('vendor_id', vid, 'name', '   '));
    raise exception 'FAIL: blank name allowed';
  exception when others then
    if sqlerrm not like '%name_required%' then raise; end if;
  end;

  -- contact responsible for masonry only
  select create_vendor_contact(jsonb_build_object(
    'vendor_id', vid, 'name', 'Jonas Murininkas', 'position', 'vadybininkas',
    'email', 'jonas@t26vendor.lt', 'phone', '+37060000001',
    'handles', jsonb_build_array('muras'))) into c1;

  -- primary contact, no category ownership
  select create_vendor_contact(jsonb_build_object(
    'vendor_id', vid, 'name', 'Ona Bendra', 'email', 'ona@t26vendor.lt',
    'is_primary', true)) into c2;

  update t26_contacts set murininkas = c1, bendras = c2;

  if (select handles from vendor_contacts where id = c1) <> array['muras'] then
    raise exception 'FAIL: handles not stored';
  end if;
  if not (select is_primary from vendor_contacts where id = c2) then
    raise exception 'FAIL: primary flag not stored';
  end if;
  if (select count(*) from activity_log
      where entity_id = vid and action = 'contact_added') <> 2 then
    raise exception 'FAIL: contact_added not logged';
  end if;
end $$;

-- only one primary per vendor
do $$
declare org uuid; vid uuid; c1 uuid;
begin
  select org_id into org from t26_ctx;
  select id into vid from vendors where org_id = org limit 1;
  select murininkas into c1 from t26_contacts;

  perform update_vendor_contact(jsonb_build_object(
    'contact_id', c1, 'name', 'Jonas Murininkas', 'email', 'jonas@t26vendor.lt',
    'handles', jsonb_build_array('muras'), 'is_primary', true));

  if (select count(*) from vendor_contacts where vendor_id = vid and is_primary) <> 1 then
    raise exception 'FAIL: more than one primary contact';
  end if;
  if not (select is_primary from vendor_contacts where id = c1) then
    raise exception 'FAIL: primary not moved to the updated contact';
  end if;

  -- put it back: Ona primary, Jonas owns 'muras'
  perform update_vendor_contact(jsonb_build_object(
    'contact_id', c1, 'name', 'Jonas Murininkas', 'email', 'jonas@t26vendor.lt',
    'handles', jsonb_build_array('muras'), 'is_primary', false));
  perform update_vendor_contact(jsonb_build_object(
    'contact_id', (select bendras from t26_contacts), 'name', 'Ona Bendra',
    'email', 'ona@t26vendor.lt', 'is_primary', true));
end $$;

-- ---------- PO routing ----------
reset role;
create temporary table t26_orders as
  select null::uuid as murui, null::uuid as vatai, null::uuid as tuscias;
do $$
declare org uuid; vid uuid; site uuid; o1 uuid; o2 uuid; o3 uuid; m_mur uuid; m_vata uuid;
begin
  select org_id into org from t26_ctx;
  select id into vid from vendors where org_id = org limit 1;
  select id into site from locations where org_id = org and type = 'site' limit 1;
  select id into m_mur from materials where org_id = org and category = 'muras' limit 1;
  select id into m_vata from materials where org_id = org and category = 'siltinimas' limit 1;

  insert into orders (org_id, order_number, site_id, vendor_id, status, requested_by)
  values (org, 'BT-T26-0001', site, vid, 'approved', 'c0c0c0c0-0000-0000-0000-00000000000a')
  returning id into o1;
  insert into order_items (order_id, material_id, description, quantity, unit)
  values (o1, m_mur, 'Blokeliai 300', 100, 'vnt');

  insert into orders (org_id, order_number, site_id, vendor_id, status, requested_by)
  values (org, 'BT-T26-0002', site, vid, 'approved', 'c0c0c0c0-0000-0000-0000-00000000000a')
  returning id into o2;
  insert into order_items (order_id, material_id, description, quantity, unit)
  values (o2, m_vata, 'Vata 100mm', 40, 'm2');

  -- free-text line, no material_id → no categories at all
  insert into orders (org_id, order_number, site_id, vendor_id, status, requested_by)
  values (org, 'BT-T26-0003', site, vid, 'approved', 'c0c0c0c0-0000-0000-0000-00000000000a')
  returning id into o3;
  insert into order_items (order_id, description, quantity, unit)
  values (o3, 'Kazkas neatpazinto', 1, 'vnt');

  update t26_orders set murui = o1, vatai = o2, tuscias = o3;
end $$;
grant select on t26_ctx, t26_contacts, t26_orders to authenticated;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"c0c0c0c0-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare pick jsonb; c1 uuid; c2 uuid;
begin
  select murininkas, bendras into c1, c2 from t26_contacts;

  -- masonry order → the masonry contact
  select pick_order_contact((select murui from t26_orders)) into pick;
  if pick->>'match' <> 'handles' or (pick->>'contact_id')::uuid <> c1
     or pick->>'to_address' <> 'jonas@t26vendor.lt' then
    raise exception 'FAIL: handles routing wrong: %', pick;
  end if;

  -- insulation order → nobody handles it → primary contact
  select pick_order_contact((select vatai from t26_orders)) into pick;
  if pick->>'match' <> 'primary' or (pick->>'contact_id')::uuid <> c2
     or pick->>'to_address' <> 'ona@t26vendor.lt' then
    raise exception 'FAIL: primary fallback wrong: %', pick;
  end if;

  -- no categories → still the primary contact
  select pick_order_contact((select tuscias from t26_orders)) into pick;
  if pick->>'match' <> 'primary' then
    raise exception 'FAIL: empty-category order did not fall back: %', pick;
  end if;
end $$;

-- with no contacts at all the vendor address is used
do $$
declare pick jsonb; org uuid; vid uuid;
begin
  select org_id into org from t26_ctx;
  select id into vid from vendors where org_id = org limit 1;
  perform remove_vendor_contact((select murininkas from t26_contacts));
  perform remove_vendor_contact((select bendras from t26_contacts));
  if (select count(*) from vendor_contacts where vendor_id = vid) <> 0 then
    raise exception 'FAIL: contacts not removed';
  end if;

  select pick_order_contact((select murui from t26_orders)) into pick;
  if pick->>'match' <> 'vendor' or pick->>'to_address' <> 'info@t26vendor.lt'
     or pick->>'contact_id' is not null then
    raise exception 'FAIL: vendor fallback wrong: %', pick;
  end if;
end $$;

-- ---------- proof chain carries the contact ----------
do $$
declare org uuid; vid uuid; oid uuid; c1 uuid;
begin
  select org_id into org from t26_ctx;
  select id into vid from vendors where org_id = org limit 1;
  select murui into oid from t26_orders;

  select create_vendor_contact(jsonb_build_object(
    'vendor_id', vid, 'name', 'Jonas Grizo', 'email', 'jonas@t26vendor.lt',
    'handles', jsonb_build_array('muras'))) into c1;

  perform record_order_sent(jsonb_build_object(
    'order_id', oid, 'to_address', 'jonas@t26vendor.lt', 'subject', 'PO BT-T26-0001',
    'contact_id', c1));

  if (select contact_id from outbound_messages where entity_id = oid limit 1) <> c1 then
    raise exception 'FAIL: contact not recorded on the proof row';
  end if;
  if (select status from orders where id = oid) <> 'ordered' then
    raise exception 'FAIL: send did not advance the order';
  end if;

  -- a contact from another org cannot be stapled onto this proof
  begin
    perform record_order_sent(jsonb_build_object(
      'order_id', oid, 'to_address', 'x@x.lt', 'subject', 'x',
      'contact_id', '00000000-0000-0000-0000-0000000000ff'));
    raise exception 'FAIL: foreign contact accepted';
  exception when others then
    if sqlerrm not like '%contact_not_found%' then raise; end if;
  end;
end $$;

-- ---------- org isolation on read ----------
set local request.jwt.claims =
  '{"sub":"c0c0c0c0-0000-0000-0000-00000000000c","role":"authenticated"}';
do $$
declare org uuid;
begin
  select org_id into org from t26_ctx;
  if (select count(*) from vendor_contacts where org_id = org) <> 0 then
    raise exception 'FAIL: outsider can read vendor contacts';
  end if;
end $$;

reset role;
rollback;

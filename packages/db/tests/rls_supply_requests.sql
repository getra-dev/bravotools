-- Test: E2-A requests pipeline (0015).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('bcbcbcbc-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dispatcher@t3.local', now(), now()),
  ('bcbcbcbc-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'foreman@t3.local', now(), now()),
  ('bcbcbcbc-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@t3.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"bcbcbcbc-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t3_ctx as
  select create_organization('T3 Supply Org') as org_id;

do $$
declare org uuid; site uuid;
begin
  select org_id into org from t3_ctx;
  perform invite_member(org, 'foreman@t3.local', 'site_manager');
  perform invite_member(org, 'stranger@t3.local', 'worker');
  select create_location(org, '{"name":"T3 Objektas","type":"site"}'::jsonb) into site;
  perform assign_site_member(site, 'bcbcbcbc-0000-0000-0000-00000000000b', true);
  perform create_material(org, 'EPS 100 polistirolas 50mm', 'vnt', 'šiltinimas');
end $$;

reset role;
do $$
declare org uuid; mid uuid;
begin
  select org_id into org from t3_ctx;
  select id into mid from materials where org_id = org limit 1;
  insert into material_aliases (org_id, material_id, alias, source, confirmed)
  values (org, mid, 'polistirolis', 'site', true);
end $$;
set local role authenticated;

-- ---------- foreman creates a request for own site ----------
set local request.jwt.claims =
  '{"sub":"bcbcbcbc-0000-0000-0000-00000000000b","role":"authenticated"}';

create temporary table t3_req as select null::uuid as req_id;
do $$
declare org uuid; site uuid; rid uuid;
begin
  select org_id into org from t3_ctx;
  select id into site from locations where org_id = org and type = 'site' limit 1;

  begin
    select create_material_request(jsonb_build_object(
      'site_id', site, 'is_hot', true,
      'items', jsonb_build_array(jsonb_build_object('raw_text', 'x')))) into rid;
    raise exception 'FAIL: HOT without reason allowed';
  exception when others then
    if sqlerrm not like '%hot_reason_required%' then raise; end if;
  end;

  select create_material_request(jsonb_build_object(
    'site_id', site,
    'needed_by', (current_date + 3)::text,
    'items', jsonb_build_array(
      jsonb_build_object('raw_text', 'polistirolio 10 lapu', 'qty', '10', 'unit', 'vnt'),
      jsonb_build_object('raw_text', 'kazkokia nauja medziaga')))) into rid;
  update t3_req set req_id = rid;

  if (select count(*) from material_request_items where request_id = rid) <> 2 then
    raise exception 'FAIL: items not created';
  end if;
  -- 0017: worker-entered qty/unit stored structured at the source
  if (select qty from material_request_items
      where request_id = rid and raw_text like 'polistirolio%') <> 10 then
    raise exception 'FAIL: worker qty not stored';
  end if;
end $$;

-- stranger (unassigned worker) sees nothing, cannot create
set local request.jwt.claims =
  '{"sub":"bcbcbcbc-0000-0000-0000-00000000000c","role":"authenticated"}';
do $$
declare org uuid; site uuid; rid uuid; n integer;
begin
  select org_id into org from t3_ctx;
  select id into site from locations where org_id = org and type = 'site' limit 1;
  select count(*) into n from material_requests where org_id = org;
  if n <> 0 then raise exception 'FAIL: unassigned worker sees requests (%)', n; end if;
  begin
    select create_material_request(jsonb_build_object(
      'site_id', site,
      'items', jsonb_build_array(jsonb_build_object('raw_text', 'x')))) into rid;
    raise exception 'FAIL: unassigned worker created a request';
  exception when others then
    if sqlerrm not like '%not_assigned%' then raise; end if;
  end;
end $$;

-- ---------- dispatcher: suggestions, confirm (learning), order ----------
set local request.jwt.claims =
  '{"sub":"bcbcbcbc-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare
  org uuid; rid uuid; mid uuid; item1 uuid; item2 uuid; res jsonb;
  top_name text; top_score real; new_mat uuid;
begin
  select org_id into org from t3_ctx;
  select req_id into rid from t3_req;
  select id into mid from materials where org_id = org and canonical_name like 'EPS%';

  -- fuzzy: 'polistirolio 10 lapu' must hit the alias 'polistirolis'
  select canonical_name, score into top_name, top_score
  from suggest_material_matches(org, 'polistirolio 10 lapu') limit 1;
  if top_name is null or top_name not like 'EPS%' then
    raise exception 'FAIL: fuzzy suggestion missed (got %, score %)', top_name, top_score;
  end if;

  select id into item1 from material_request_items
  where request_id = rid and raw_text like 'polistirolio%';
  select id into item2 from material_request_items
  where request_id = rid and raw_text like 'kazkokia%';

  -- dispatcher confirms WITHOUT qty override — worker's qty must survive
  perform confirm_material_match(item1, mid);
  if (select status from material_request_items where id = item1) <> 'confirmed' then
    raise exception 'FAIL: item not confirmed';
  end if;
  if (select qty from material_request_items where id = item1) <> 10 then
    raise exception 'FAIL: worker qty lost on confirm';
  end if;
  -- learning: alias appeared
  if (select count(*) from material_aliases
      where org_id = org and alias = 'polistirolio 10 lapu' and confirmed) <> 1 then
    raise exception 'FAIL: alias not learned';
  end if;

  -- unknown line: create material from text, confirm
  select create_material(org, 'Kazkokia nauja medziaga', 'vnt', null) into new_mat;
  perform confirm_material_match(item2, new_mat, 5, 'pak');

  select create_order_from_request(rid, null) into res;
  if res->>'order_number' !~ '^BT-\d{4}-\d{4}$' then
    raise exception 'FAIL: order number % malformed', res->>'order_number';
  end if;
  if (select count(*) from order_items
      where order_id = (res->>'order_id')::uuid) <> 2 then
    raise exception 'FAIL: order lines missing';
  end if;
  if (select quantity from order_items
      where order_id = (res->>'order_id')::uuid
        and description like 'EPS%') <> 10 then
    raise exception 'FAIL: qty did not flow into order line';
  end if;
  if (select status from material_requests where id = rid) <> 'ordered' then
    raise exception 'FAIL: request not marked ordered';
  end if;

  perform update_order_status((res->>'order_id')::uuid, 'approved');
  perform update_order_status((res->>'order_id')::uuid, 'delivered');
  begin
    perform update_order_status((res->>'order_id')::uuid, 'ordered');
    raise exception 'FAIL: closed order reopened';
  exception when others then
    if sqlerrm not like '%order_closed%' then raise; end if;
  end;
end $$;

-- foreman cannot confirm matches
set local request.jwt.claims =
  '{"sub":"bcbcbcbc-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare org uuid; item uuid; mid uuid;
begin
  select org_id into org from t3_ctx;
  select i.id into item from material_request_items i limit 1;
  select id into mid from materials where org_id = org limit 1;
  begin
    perform confirm_material_match(item, mid);
    raise exception 'FAIL: foreman confirmed a match';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

reset role;
rollback;

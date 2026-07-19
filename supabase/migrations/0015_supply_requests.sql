-- =====================================================
-- 0015 — Etapas 2A (SPEC 3.2/3.3 be AI):
-- materials dictionary + material requests + fuzzy match
-- (pg_trgm) with alias LEARNING + request→order pipeline.
-- AI layers (voice-parse, dedup) plug in later on top of
-- the same RPCs.
-- =====================================================

create extension if not exists pg_trgm;

-- ---------- read policies (roles matrix §1) ----------

create or replace function public.is_supply(target_org uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from memberships
    where org_id = target_org and user_id = auth.uid()
      and role in ('owner', 'admin', 'supply_manager')
  );
$$;

create policy materials_org_select on materials
  for select using (is_org_member(org_id));
create policy aliases_org_select on material_aliases
  for select using (is_org_member(org_id));
create policy packages_org_select on material_packages
  for select using (exists (
    select 1 from materials m
    where m.id = material_packages.material_id and is_org_member(m.org_id)
  ));

-- workers/site managers: own sites only; supply side: everything
create policy requests_select on material_requests
  for select using (
    is_supply(org_id)
    or requested_by = auth.uid()
    or is_assigned_to_site(site_id)
  );
create policy request_items_select on material_request_items
  for select using (exists (
    select 1 from material_requests r where r.id = material_request_items.request_id
  ));

-- ---------- create request (mobile) ----------

create or replace function public.create_material_request(args jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_site uuid := (args->>'site_id')::uuid;
  v_needed date := nullif(args->>'needed_by', '')::date;
  v_hot boolean := coalesce((args->>'is_hot')::boolean, false);
  v_reason text := nullif(args->>'hot_reason', '');
  target_org uuid;
  new_id uuid;
  item jsonb;
  item_count integer := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select org_id into target_org from locations where id = v_site;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_org_member(target_org) then raise exception 'not_allowed'; end if;
  if not (is_supply(target_org) or is_assigned_to_site(v_site)) then
    raise exception 'not_assigned';
  end if;
  if v_hot and v_reason is null then raise exception 'hot_reason_required'; end if;

  insert into material_requests (org_id, site_id, requested_by, needed_by, is_hot, hot_reason)
  values (target_org, v_site, auth.uid(), v_needed, v_hot,
          case when v_hot then v_reason else null end)
  returning id into new_id;

  for item in select * from jsonb_array_elements(coalesce(args->'items', '[]'::jsonb)) loop
    if nullif(trim(item->>'raw_text'), '') is not null then
      insert into material_request_items (request_id, raw_text)
      values (new_id, trim(item->>'raw_text'));
      item_count := item_count + 1;
    end if;
  end loop;
  if item_count = 0 then raise exception 'items_required'; end if;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'material_request', new_id, 'user', auth.uid(), 'created',
          jsonb_build_object('site_id', v_site, 'items', item_count, 'is_hot', v_hot));
  return new_id;
end $$;

-- ---------- fuzzy suggestions (pg_trgm; the AI layer will call this too) ----------

create or replace function public.suggest_material_matches(target_org uuid, raw text)
returns table (material_id uuid, canonical_name text, base_unit text, score real)
language sql security definer stable set search_path = public as $$
  select m.id, m.canonical_name, m.base_unit, max(s.score) as score
  from (
    select a.material_id as mid, similarity(lower(a.alias), lower(raw)) as score
    from material_aliases a
    where a.org_id = target_org
    union all
    select m2.id, similarity(lower(m2.canonical_name), lower(raw))
    from materials m2
    where m2.org_id = target_org
  ) s
  join materials m on m.id = s.mid
  where s.score > 0.15 and is_org_member(target_org)
  group by m.id, m.canonical_name, m.base_unit
  order by max(s.score) desc
  limit 3;
$$;

-- ---------- confirm match: the dictionary LEARNS ----------

create or replace function public.confirm_material_match(
  item_id uuid, target_material uuid, p_qty numeric default null, p_unit text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  req record;
  raw text;
begin
  select r.*, i.raw_text into req
  from material_request_items i
  join material_requests r on r.id = i.request_id
  where i.id = item_id;
  if req.id is null then raise exception 'not_found'; end if;
  if not is_supply(req.org_id) then raise exception 'not_allowed'; end if;

  select raw_text into raw from material_request_items where id = item_id;

  update material_request_items
  set material_id = target_material,
      qty = coalesce(p_qty, qty),
      unit = coalesce(nullif(trim(p_unit), ''), unit),
      match_confidence = 1,
      status = 'confirmed'
  where id = item_id;

  insert into material_aliases (org_id, material_id, alias, source, confirmed)
  values (req.org_id, target_material, lower(trim(raw)), 'manual', true)
  on conflict (org_id, alias) do nothing;

  update material_requests set status = 'processing'
  where id = req.id and status = 'open';
end $$;

create or replace function public.create_material(
  target_org uuid, m_name text, m_unit text default 'vnt', m_category text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  if coalesce(trim(m_name), '') = '' then raise exception 'name_required'; end if;
  insert into materials (org_id, canonical_name, base_unit, category)
  values (target_org, trim(m_name), coalesce(nullif(trim(m_unit), ''), 'vnt'),
          nullif(trim(coalesce(m_category, '')), ''))
  returning id into new_id;
  return new_id;
end $$;

-- ---------- request → order ----------

create or replace function public.next_order_number(target_org uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  counter integer;
  ord_year text;
  this_year text := to_char(now(), 'YYYY');
  prefix text;
  candidate text;
  attempts integer := 0;
begin
  select coalesce(settings#>>'{numbering,order,year}', ''),
         coalesce((settings#>>'{numbering,order,counter}')::integer, 0),
         coalesce(settings#>>'{numbering,order,prefix}', 'BT-')
    into ord_year, counter, prefix
  from organizations where id = target_org for update;

  if ord_year <> this_year then counter := 0; end if;

  loop
    counter := counter + 1;
    attempts := attempts + 1;
    if attempts > 10000 then raise exception 'order_sequence_exhausted'; end if;
    candidate := prefix || this_year || '-' || lpad(counter::text, 4, '0');
    exit when not exists (
      select 1 from orders where org_id = target_org and order_number = candidate
    );
  end loop;

  update organizations
  set settings = jsonb_set(
        jsonb_set(coalesce(settings, '{}'::jsonb), '{numbering}',
                  coalesce(settings->'numbering', '{}'::jsonb), true),
        '{numbering,order}',
        jsonb_build_object('prefix', prefix, 'year', this_year, 'counter', counter), true)
  where id = target_org;
  return candidate;
end $$;

create or replace function public.create_order_from_request(req_id uuid, p_vendor uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  req record;
  new_order uuid;
  ord_no text;
  item record;
  line_count integer := 0;
begin
  select * into req from material_requests where id = req_id;
  if req.id is null then raise exception 'not_found'; end if;
  if not is_supply(req.org_id) then raise exception 'not_allowed'; end if;
  if req.status not in ('open', 'processing') then raise exception 'request_closed'; end if;

  ord_no := next_order_number(req.org_id);
  insert into orders (org_id, order_number, site_id, vendor_id, status, requested_by,
                      needed_by, is_hot)
  values (req.org_id, ord_no, req.site_id, p_vendor, 'requested', auth.uid(),
          req.needed_by, req.is_hot)
  returning id into new_order;

  for item in
    select i.*, m.canonical_name, m.base_unit
    from material_request_items i
    left join materials m on m.id = i.material_id
    where i.request_id = req_id and i.status = 'confirmed'
  loop
    insert into order_items (order_id, description, quantity, unit)
    values (new_order,
            coalesce(item.canonical_name, item.raw_text),
            coalesce(item.qty, 1),
            coalesce(item.unit, item.base_unit, 'vnt'));
    update material_request_items
    set status = 'ordered'
    where id = item.id;
    line_count := line_count + 1;
  end loop;
  if line_count = 0 then raise exception 'no_confirmed_items'; end if;

  update material_requests set status = 'ordered' where id = req_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (req.org_id, 'order', new_order, 'user', auth.uid(), 'created',
          jsonb_build_object('order_number', ord_no, 'from_request', req_id,
                             'lines', line_count));
  return jsonb_build_object('order_id', new_order, 'order_number', ord_no);
end $$;

create or replace function public.update_order_status(order_id uuid, new_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare ord record;
begin
  select * into ord from orders where id = order_id;
  if ord.id is null then raise exception 'not_found'; end if;
  if not is_supply(ord.org_id) then raise exception 'not_allowed'; end if;
  if new_status not in ('requested','approved','ordered','partially_delivered','delivered','cancelled') then
    raise exception 'invalid_status';
  end if;
  if ord.status in ('delivered', 'cancelled') then
    raise exception 'order_closed';
  end if;

  update orders
  set status = new_status,
      approved_by = case when new_status = 'approved' then auth.uid() else approved_by end,
      confirmed_at = case when new_status = 'ordered' then now() else confirmed_at end
  where id = order_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (ord.org_id, 'order', order_id, 'user', auth.uid(), 'status_changed',
          jsonb_build_object('from', ord.status, 'to', new_status));
end $$;

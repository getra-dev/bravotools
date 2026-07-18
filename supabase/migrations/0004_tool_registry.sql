-- =====================================================
-- 0004 — SPEC 2.3: Tool registry & QR
-- 1) read policies for everything the tool detail shows
--    (movements, components, acts, repairs, photos,
--    external persons, locations)
-- 2) next_tool_qr helper (shared numbering with import)
-- 3) create_tool / update_tool RPCs with role gate +
--    activity_log entries
-- =====================================================

-- ---------- 1. read policies (org members) ----------

create policy locations_org_select on locations
  for select using (is_org_member(org_id));

create policy movements_org_select on tool_movements
  for select using (is_org_member(org_id));

create policy components_org_select on tool_components
  for select using (is_org_member(org_id));

create policy movement_components_org_select on movement_components
  for select using (exists (
    select 1 from tool_movements m
    where m.id = movement_components.movement_id and is_org_member(m.org_id)
  ));

create policy acts_org_select on handover_acts
  for select using (is_org_member(org_id));

create policy repairs_org_select on tool_repairs
  for select using (is_org_member(org_id));

create policy photos_org_select on tool_photos
  for select using (is_org_member(org_id));

create policy external_persons_org_select on external_persons
  for select using (is_org_member(org_id));

create policy activity_org_select on activity_log
  for select using (is_org_member(org_id));

-- ---------- 2. shared QR numbering ----------

-- Bumps the org tool counter past any globally-taken qr_code and returns
-- the reserved code. Caller must hold the org row lock (for update).
create or replace function public.next_tool_qr(target_org uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  counter integer;
  prefix text;
  candidate text;
  attempts integer := 0;
begin
  select coalesce((settings#>>'{numbering,tool,counter}')::integer, 0),
         coalesce(settings#>>'{numbering,tool,prefix}', 'BT-TOOL-')
    into counter, prefix
  from organizations where id = target_org for update;

  loop
    counter := counter + 1;
    attempts := attempts + 1;
    if attempts > 10000 then
      raise exception 'qr_sequence_exhausted';
    end if;
    candidate := prefix || lpad(counter::text, 6, '0');
    exit when not exists (select 1 from tools where qr_code = candidate);
  end loop;

  update organizations
  set settings = jsonb_set(
        jsonb_set(coalesce(settings, '{}'::jsonb), '{numbering}',
                  coalesce(settings->'numbering', '{}'::jsonb), true),
        '{numbering,tool}',
        jsonb_build_object('prefix', prefix, 'counter', counter), true)
  where id = target_org;

  return candidate;
end $$;

-- ---------- 3. create / update RPCs ----------

create or replace function public.assert_tool_editor(target_org uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare caller_role text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select role into caller_role
  from memberships where org_id = target_org and user_id = auth.uid();
  if caller_role is null or caller_role not in ('owner','admin','supply_manager') then
    raise exception 'not_allowed';
  end if;
end $$;

create or replace function public.create_tool(target_org uuid, payload jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  v_name text;
begin
  perform assert_tool_editor(target_org);

  v_name := nullif(trim(payload->>'name'), '');
  if v_name is null then
    raise exception 'name_required';
  end if;

  insert into tools (org_id, name, qr_code, category_id, serial_number, inventory_code,
                     purchase_price, purchase_date, purchased_from_vendor_id,
                     internal_rate_daily, warranty_months, current_location_id, notes, status)
  values (
    target_org,
    v_name,
    next_tool_qr(target_org),
    nullif(payload->>'category_id', '')::uuid,
    nullif(trim(payload->>'serial_number'), ''),
    nullif(trim(payload->>'inventory_code'), ''),
    nullif(replace(replace(payload->>'purchase_price', ' ', ''), ',', '.'), '')::numeric,
    nullif(payload->>'purchase_date', '')::date,
    nullif(payload->>'vendor_id', '')::uuid,
    nullif(replace(replace(payload->>'internal_rate_daily', ' ', ''), ',', '.'), '')::numeric,
    nullif(payload->>'warranty_months', '')::integer,
    nullif(payload->>'location_id', '')::uuid,
    nullif(trim(payload->>'notes'), ''),
    'available'
  )
  returning id into new_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'tool', new_id, 'user', auth.uid(), 'created',
          jsonb_build_object('name', v_name));
  return new_id;
end $$;

create or replace function public.update_tool(tool_id uuid, payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  target_org uuid;
  v_name text;
begin
  select org_id into target_org from tools where id = tool_id;
  if target_org is null then
    raise exception 'not_found';
  end if;
  perform assert_tool_editor(target_org);

  v_name := nullif(trim(payload->>'name'), '');
  if v_name is null then
    raise exception 'name_required';
  end if;

  update tools set
    name = v_name,
    category_id = nullif(payload->>'category_id', '')::uuid,
    serial_number = nullif(trim(payload->>'serial_number'), ''),
    inventory_code = nullif(trim(payload->>'inventory_code'), ''),
    purchase_price = nullif(replace(replace(payload->>'purchase_price', ' ', ''), ',', '.'), '')::numeric,
    purchase_date = nullif(payload->>'purchase_date', '')::date,
    purchased_from_vendor_id = nullif(payload->>'vendor_id', '')::uuid,
    internal_rate_daily = nullif(replace(replace(payload->>'internal_rate_daily', ' ', ''), ',', '.'), '')::numeric,
    warranty_months = nullif(payload->>'warranty_months', '')::integer,
    current_location_id = nullif(payload->>'location_id', '')::uuid,
    notes = nullif(trim(payload->>'notes'), '')
  where id = tool_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'tool', tool_id, 'user', auth.uid(), 'updated',
          jsonb_build_object('name', v_name));
end $$;

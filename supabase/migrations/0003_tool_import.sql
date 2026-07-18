-- =====================================================
-- 0003 — SPEC 2.2: Excel import of the tool registry
-- import_tools RPC: bulk-create tools + find-or-create
-- categories/vendors, org-scoped QR numbering (settings),
-- per-row skip report ("fix later" — import never blocks),
-- everything in one transaction + activity_log entry.
-- =====================================================

-- org members can read categories and vendors (needed by tools list,
-- import preview and later order screens); writes stay RPC-only
create policy categories_org_select on tool_categories
  for select using (is_org_member(org_id));

create policy vendors_org_select on vendors
  for select using (is_org_member(org_id));

create or replace function public.import_tools(target_org uuid, rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  r jsonb;
  v_name text; v_serial text; v_inv text; v_cat text; v_vendor text; v_notes text;
  v_price numeric; v_date date;
  cat_id uuid; vend_id uuid;
  counter integer;
  prefix text;
  imported integer := 0;
  skipped jsonb := '[]'::jsonb;
  idx integer := 0;
  attempts integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select role into caller_role
  from memberships where org_id = target_org and user_id = auth.uid();
  if caller_role is null or caller_role not in ('owner','admin','supply_manager') then
    raise exception 'not_allowed';
  end if;

  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'invalid_payload';
  end if;
  if jsonb_array_length(rows) > 2000 then
    raise exception 'too_many_rows';
  end if;

  -- org-scoped numbering (SPEC §6); lock the org row for the whole import
  select coalesce((settings#>>'{numbering,tool,counter}')::integer, 0),
         coalesce(settings#>>'{numbering,tool,prefix}', 'BT-TOOL-')
    into counter, prefix
  from organizations where id = target_org for update;

  for r in select * from jsonb_array_elements(rows) loop
    idx := idx + 1;
    v_name := nullif(trim(r->>'name'), '');
    if v_name is null then
      skipped := skipped || jsonb_build_object('row', idx, 'reason', 'missing_name', 'data', r);
      continue;
    end if;

    v_serial := nullif(trim(r->>'serial_number'), '');
    v_inv    := nullif(trim(r->>'inventory_code'), '');
    v_cat    := nullif(trim(r->>'category'), '');
    v_vendor := nullif(trim(r->>'vendor'), '');
    v_notes  := nullif(trim(r->>'notes'), '');

    begin
      v_price := nullif(replace(replace(r->>'purchase_price', ' ', ''), ',', '.'), '')::numeric;
    exception when others then
      v_price := null;
    end;
    begin
      v_date := nullif(trim(r->>'purchase_date'), '')::date;
    exception when others then
      v_date := null;
    end;

    cat_id := null;
    if v_cat is not null then
      insert into tool_categories (org_id, name) values (target_org, v_cat)
      on conflict (org_id, name) do update set name = excluded.name
      returning id into cat_id;
    end if;

    vend_id := null;
    if v_vendor is not null then
      select id into vend_id from vendors
      where org_id = target_org and lower(name) = lower(v_vendor);
      if vend_id is null then
        insert into vendors (org_id, name, type)
        values (target_org, v_vendor, '{tools}')
        returning id into vend_id;
      end if;
    end if;

    -- qr_code is globally unique — walk the counter past collisions
    attempts := 0;
    loop
      counter := counter + 1;
      attempts := attempts + 1;
      if attempts > 10000 then
        raise exception 'qr_sequence_exhausted';
      end if;
      begin
        insert into tools (org_id, category_id, name, serial_number, inventory_code, qr_code,
                           purchase_price, purchase_date, purchased_from_vendor_id, notes, status)
        values (target_org, cat_id, v_name, v_serial, v_inv,
                prefix || lpad(counter::text, 6, '0'),
                v_price, v_date, vend_id, v_notes, 'available');
        exit;
      exception when unique_violation then
        -- qr taken (e.g. seeded org shares the default prefix) — try next number
      end;
    end loop;

    imported := imported + 1;
  end loop;

  -- jsonb_set silently no-ops when an intermediate key is missing,
  -- so materialize {numbering} before writing {numbering,tool}
  update organizations
  set settings = jsonb_set(
        jsonb_set(coalesce(settings, '{}'::jsonb), '{numbering}',
                  coalesce(settings->'numbering', '{}'::jsonb), true),
        '{numbering,tool}',
        jsonb_build_object('prefix', prefix, 'counter', counter), true)
  where id = target_org;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'organization', target_org, 'user', auth.uid(), 'tools_imported',
          jsonb_build_object('imported', imported, 'skipped', skipped));

  return jsonb_build_object('imported', imported, 'skipped', skipped);
end $$;

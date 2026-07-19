-- =====================================================
-- 0021 — Etapas 2 (B): material catalog + vendor prices +
-- price history. materials was a bare dictionary; now the
-- supply side can edit it, attach per-vendor prices, and
-- every price change is snapshotted so it can be tracked
-- over time. Order creation auto-fills unit_price from the
-- chosen vendor's catalog so PO totals become real.
-- =====================================================

-- vendor_catalog_items had RLS enabled but no policy (rows read as 0)
create policy vendor_catalog_org_select on vendor_catalog_items
  for select using (is_org_member(org_id));

-- one current price per (vendor, material) → upsert target
create unique index if not exists vendor_catalog_vendor_material_uq
  on vendor_catalog_items (vendor_id, material_id)
  where material_id is not null;

-- price history: one row per observed price point (per vendor)
create table if not exists material_price_points (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  price numeric not null,
  unit text,
  source text not null default 'manual',
  observed_at timestamptz not null default now()
);
alter table material_price_points enable row level security;
create index if not exists material_price_points_material_idx
  on material_price_points (material_id, observed_at desc);

create policy material_price_points_org_select on material_price_points
  for select using (is_org_member(org_id));

-- ---------- edit a dictionary entry ----------
create or replace function public.update_material(material_id uuid, payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare target_org uuid; v_name text;
begin
  select org_id into target_org from materials where id = material_id;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  v_name := nullif(trim(payload->>'canonical_name'), '');
  if v_name is null then raise exception 'name_required'; end if;

  update materials
  set canonical_name = v_name,
      base_unit = coalesce(nullif(trim(payload->>'base_unit'), ''), base_unit),
      category = nullif(trim(payload->>'category'), '')
  where id = material_id;
end $$;

-- ---------- set a vendor price (upsert + snapshot) ----------
create or replace function public.set_vendor_price(args jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_material uuid := (args->>'material_id')::uuid;
  v_vendor uuid := (args->>'vendor_id')::uuid;
  v_price numeric := nullif(replace(args->>'price', ',', '.'), '')::numeric;
  v_unit text;
  target_org uuid;
begin
  select org_id, base_unit into target_org, v_unit from materials where id = v_material;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  if v_price is null or v_price < 0 then raise exception 'invalid_price'; end if;
  if not exists (select 1 from vendors where id = v_vendor and org_id = target_org) then
    raise exception 'vendor_not_found';
  end if;
  v_unit := coalesce(nullif(trim(args->>'unit'), ''), v_unit);

  insert into vendor_catalog_items
    (org_id, vendor_id, material_id, sku, name, unit, price, lead_time_days, is_available, source)
  values
    (target_org, v_vendor, v_material, 'mat:' || v_material,
     (select canonical_name from materials where id = v_material),
     v_unit, v_price,
     nullif(args->>'lead_time_days', '')::integer,
     coalesce((args->>'is_available')::boolean, true), 'manual')
  on conflict (vendor_id, material_id) where material_id is not null
  do update set price = excluded.price,
                unit = excluded.unit,
                lead_time_days = excluded.lead_time_days,
                is_available = excluded.is_available,
                synced_at = now();

  insert into material_price_points (org_id, material_id, vendor_id, price, unit, source)
  values (target_org, v_material, v_vendor, v_price, v_unit, 'manual');

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'material', v_material, 'user', auth.uid(), 'price_set',
          jsonb_build_object('vendor_id', v_vendor, 'price', v_price));
end $$;

-- ---------- order creation now auto-fills unit_price from the vendor catalog ----------
create or replace function public.create_order_from_request(req_id uuid, p_vendor uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  req record;
  new_order uuid;
  ord_no text;
  item record;
  line_count integer := 0;
  v_price numeric;
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
    -- pull the chosen vendor's catalog price for this material, if any
    v_price := null;
    if p_vendor is not null and item.material_id is not null then
      select price into v_price from vendor_catalog_items
      where vendor_id = p_vendor and material_id = item.material_id;
    end if;

    insert into order_items (order_id, description, quantity, unit, unit_price)
    values (new_order,
            coalesce(item.canonical_name, item.raw_text),
            coalesce(item.qty, 1),
            coalesce(item.unit, item.base_unit, 'vnt'),
            v_price);
    update material_request_items set status = 'ordered' where id = item.id;
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

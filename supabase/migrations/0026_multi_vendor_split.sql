-- =====================================================
-- 0026 — Etapas 2 (D+E): split one request across vendors,
-- and re-order a shortfall from a different vendor.
-- D: dispatcher assigns each confirmed line to a vendor →
--    one PO per distinct vendor (some blocks from A, stone
--    wool from B).
-- E: a delivery came short → re-order the remaining qty from
--    another vendor; the original issue becomes 'redelivery'.
-- Reuses the per-line price + ETA defaulting from the catalog.
-- =====================================================

-- shared helper: append one confirmed request line to an order, pulling
-- price + lead time from the target vendor's catalog.
create or replace function public.add_line_to_order(
  p_order uuid, p_vendor uuid, p_item_id uuid, p_material_id uuid,
  p_raw_text text, p_qty numeric, p_unit text,
  p_canonical text, p_base_unit text, p_vendor_lead integer)
returns void
language plpgsql security definer set search_path = public as $$
declare v_price numeric; v_lead integer;
begin
  if p_vendor is not null and p_material_id is not null then
    select price, lead_time_days into v_price, v_lead from vendor_catalog_items
    where vendor_id = p_vendor and material_id = p_material_id;
  end if;
  v_lead := coalesce(v_lead, p_vendor_lead);

  insert into order_items (order_id, material_id, description, quantity, unit,
                           unit_price, expected_date)
  values (p_order, p_material_id,
          coalesce(p_canonical, p_raw_text),
          coalesce(p_qty, 1),
          coalesce(p_unit, p_base_unit, 'vnt'),
          v_price,
          case when v_lead is not null then current_date + v_lead else null end);
  update material_request_items set status = 'ordered' where id = p_item_id;
end $$;

-- D: split a request into one PO per assigned vendor.
-- assignments = [{ "item_id": uuid, "vendor_id": uuid }, ...]
create or replace function public.create_orders_split(req_id uuid, assignments jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  req record;
  v_vendor uuid;
  new_order uuid;
  ord_no text;
  v_lead integer;
  item record;
  results jsonb := '[]'::jsonb;
  order_count integer := 0;
begin
  select * into req from material_requests where id = req_id;
  if req.id is null then raise exception 'not_found'; end if;
  if not is_supply(req.org_id) then raise exception 'not_allowed'; end if;
  if req.status not in ('open', 'processing') then raise exception 'request_closed'; end if;
  if jsonb_array_length(coalesce(assignments, '[]'::jsonb)) = 0 then
    raise exception 'no_assignments';
  end if;

  -- every confirmed line must be assigned to a vendor
  if exists (
    select 1 from material_request_items i
    where i.request_id = req_id and i.status = 'confirmed'
      and not exists (
        select 1 from jsonb_array_elements(assignments) a
        where (a->>'item_id')::uuid = i.id and nullif(a->>'vendor_id','') is not null)
  ) then
    raise exception 'line_unassigned';
  end if;

  -- one order per distinct assigned vendor
  for v_vendor in
    select distinct (a->>'vendor_id')::uuid
    from jsonb_array_elements(assignments) a
    where nullif(a->>'vendor_id','') is not null
  loop
    if not exists (select 1 from vendors where id = v_vendor and org_id = req.org_id) then
      raise exception 'vendor_not_found';
    end if;
    select default_lead_time_days into v_lead from vendors where id = v_vendor;

    ord_no := next_order_number(req.org_id);
    insert into orders (org_id, order_number, site_id, vendor_id, status, requested_by,
                        needed_by, is_hot)
    values (req.org_id, ord_no, req.site_id, v_vendor, 'requested', auth.uid(),
            req.needed_by, req.is_hot)
    returning id into new_order;

    for item in
      select i.*, m.canonical_name, m.base_unit
      from material_request_items i
      left join materials m on m.id = i.material_id
      join jsonb_array_elements(assignments) a
        on (a->>'item_id')::uuid = i.id and (a->>'vendor_id')::uuid = v_vendor
      where i.request_id = req_id and i.status = 'confirmed'
    loop
      perform add_line_to_order(new_order, v_vendor, item.id, item.material_id,
                                item.raw_text, item.qty, item.unit,
                                item.canonical_name, item.base_unit, v_lead);
    end loop;

    insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
    values (req.org_id, 'order', new_order, 'user', auth.uid(), 'created',
            jsonb_build_object('order_number', ord_no, 'from_request', req_id, 'split', true));
    results := results || jsonb_build_object('order_id', new_order, 'order_number', ord_no,
                                             'vendor_id', v_vendor);
    order_count := order_count + 1;
  end loop;

  if order_count = 0 then raise exception 'no_confirmed_items'; end if;
  update material_requests set status = 'ordered' where id = req_id;
  return jsonb_build_object('orders', results, 'count', order_count);
end $$;

-- E: re-order the outstanding remainder of a line from another vendor.
create or replace function public.reorder_shortfall(args jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item uuid := (args->>'order_item_id')::uuid;
  v_vendor uuid := (args->>'vendor_id')::uuid;
  src record;
  target_org uuid;
  v_remaining numeric;
  v_lead integer;
  v_price numeric;
  v_cat_lead integer;
  new_order uuid;
  ord_no text;
begin
  select i.*, o.org_id, o.site_id, o.is_hot, o.needed_by
    into src
  from order_items i join orders o on o.id = i.order_id
  where i.id = v_item;
  if src.id is null then raise exception 'not_found'; end if;
  target_org := src.org_id;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from vendors where id = v_vendor and org_id = target_org) then
    raise exception 'vendor_not_found';
  end if;

  v_remaining := coalesce(nullif(replace(args->>'quantity', ',', '.'), '')::numeric,
                          src.quantity - coalesce(src.delivered_quantity, 0));
  if v_remaining <= 0 then raise exception 'nothing_to_reorder'; end if;

  select default_lead_time_days into v_lead from vendors where id = v_vendor;
  if src.material_id is not null then
    select price, lead_time_days into v_price, v_cat_lead from vendor_catalog_items
    where vendor_id = v_vendor and material_id = src.material_id;
  end if;
  v_lead := coalesce(v_cat_lead, v_lead);

  ord_no := next_order_number(target_org);
  insert into orders (org_id, order_number, site_id, vendor_id, status, requested_by,
                      needed_by, is_hot)
  values (target_org, ord_no, src.site_id, v_vendor, 'requested', auth.uid(),
          src.needed_by, src.is_hot)
  returning id into new_order;

  insert into order_items (order_id, material_id, description, quantity, unit,
                           unit_price, expected_date)
  values (new_order, src.material_id, src.description, v_remaining, src.unit,
          v_price,
          case when v_lead is not null then current_date + v_lead else null end);

  -- any open issue on the source line is now being handled by a redelivery
  update delivery_issues set status = 'redelivery'
  where order_item_id = v_item and status in ('open', 'vendor_notified');

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'order', new_order, 'user', auth.uid(), 'reorder',
          jsonb_build_object('order_number', ord_no, 'source_item', v_item,
                             'quantity', v_remaining));
  return jsonb_build_object('order_id', new_order, 'order_number', ord_no);
end $$;

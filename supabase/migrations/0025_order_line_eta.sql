-- =====================================================
-- 0025 — Etapas 2 (G): per-line expected date + the
-- "awaiting delivery" board. A mixed order (some lines from
-- the shelf tomorrow, some special-order in a month) needs
-- a date PER LINE, not one per order — so nobody has to open
-- each order to see what is late. order_items also gains
-- material_id (was only description) so ETA can default from
-- the vendor's catalog lead time and stock can reconcile.
-- =====================================================

alter table order_items
  add column if not exists material_id uuid references materials(id) on delete set null,
  add column if not exists expected_date date;

-- dispatcher override for a single line's ETA
create or replace function public.set_order_line_eta(order_item_id uuid, p_date text)
returns void
language plpgsql security definer set search_path = public as $$
declare target_org uuid;
begin
  select o.org_id into target_org
  from order_items i join orders o on o.id = i.order_id
  where i.id = order_item_id;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  update order_items
  set expected_date = nullif(p_date, '')::date
  where id = order_item_id;
end $$;

-- order creation now stamps material_id + a default expected_date per line
-- (today + the vendor's catalog lead time for that material, else the
-- vendor's default lead time). Dispatcher can override per line later.
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
  v_lead integer;
  v_vendor_lead integer;
begin
  select * into req from material_requests where id = req_id;
  if req.id is null then raise exception 'not_found'; end if;
  if not is_supply(req.org_id) then raise exception 'not_allowed'; end if;
  if req.status not in ('open', 'processing') then raise exception 'request_closed'; end if;

  select default_lead_time_days into v_vendor_lead from vendors where id = p_vendor;

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
    v_price := null;
    v_lead := null;
    if p_vendor is not null and item.material_id is not null then
      select price, lead_time_days into v_price, v_lead from vendor_catalog_items
      where vendor_id = p_vendor and material_id = item.material_id;
    end if;
    v_lead := coalesce(v_lead, v_vendor_lead);

    insert into order_items (order_id, material_id, description, quantity, unit,
                             unit_price, expected_date)
    values (new_order, item.material_id,
            coalesce(item.canonical_name, item.raw_text),
            coalesce(item.qty, 1),
            coalesce(item.unit, item.base_unit, 'vnt'),
            v_price,
            case when v_lead is not null then current_date + v_lead else null end);
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

-- =====================================================
-- 0023 — Etapas 2 (C): own warehouse stock. stock_items /
-- stock_movements existed but were empty and unwired. Now
-- the supply side keeps material balances per location, and
-- the dispatcher can see "we already have N in the Kaunas
-- warehouse" before ordering (leftovers from other sites).
-- =====================================================

create policy stock_items_org_select on stock_items
  for select using (is_org_member(org_id));
create policy stock_movements_org_select on stock_movements
  for select using (is_org_member(org_id));

-- one movement = one ledger row + the running balance updated.
-- receipt/transfer_in add; issue/transfer_out/write_off subtract;
-- adjustment sets the balance to an exact target (records the delta).
create or replace function public.adjust_stock(args jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_material uuid := (args->>'material_id')::uuid;
  v_location uuid := (args->>'location_id')::uuid;
  v_type text := args->>'movement_type';
  v_qty numeric := nullif(replace(args->>'quantity', ',', '.'), '')::numeric;
  target_org uuid;
  v_unit text;
  cur numeric;
  delta numeric;
  new_qty numeric;
  v_stock uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select org_id, base_unit into target_org, v_unit from materials where id = v_material;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from locations where id = v_location and org_id = target_org) then
    raise exception 'location_not_found';
  end if;
  if v_type not in ('receipt','issue','transfer_in','transfer_out','adjustment','write_off') then
    raise exception 'invalid_type';
  end if;
  if v_qty is null or v_qty < 0 then raise exception 'invalid_qty'; end if;

  select id, quantity into v_stock, cur from stock_items
  where org_id = target_org and material_id = v_material and location_id = v_location;
  cur := coalesce(cur, 0);

  if v_type in ('receipt', 'transfer_in') then
    delta := v_qty; new_qty := cur + v_qty;
  elsif v_type in ('issue', 'transfer_out', 'write_off') then
    delta := -v_qty; new_qty := cur - v_qty;
  else -- adjustment: set exact
    delta := v_qty - cur; new_qty := v_qty;
  end if;
  if new_qty < 0 then raise exception 'insufficient_stock'; end if;

  if v_stock is null then
    insert into stock_items (org_id, material_id, location_id, quantity, unit)
    values (target_org, v_material, v_location, new_qty, v_unit)
    returning id into v_stock;
  else
    update stock_items set quantity = new_qty where id = v_stock;
  end if;

  insert into stock_movements
    (org_id, stock_item_id, movement_type, quantity, performed_by, performed_at, notes)
  values (target_org, v_stock, v_type, delta, auth.uid(), now(),
          nullif(trim(args->>'notes'), ''));

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'stock_item', v_stock, 'user', auth.uid(), v_type,
          jsonb_build_object('delta', delta, 'balance', new_qty, 'location', v_location));
  return jsonb_build_object('stock_item_id', v_stock, 'balance', new_qty);
end $$;

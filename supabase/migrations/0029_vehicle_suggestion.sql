-- =====================================================
-- 0029 — Etapas 2 (3.4c-2): greedy vehicle suggestion.
-- Sum the load (weight / volume / pallets / longest item)
-- across a delivery task's order lines × material params,
-- apply the hard filters (crane, length, pallets, capacity),
-- and pick the SMALLEST available vehicle that fits — the
-- dispatcher pre-selects it, warned if >85% loaded.
-- =====================================================

create or replace function public.suggest_delivery_vehicle(task_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  tsk record;
  v_weight numeric;
  v_volume numeric;
  v_pallets numeric;
  v_length numeric;
  v_crane boolean;
  best record;
begin
  select dt.*, o.org_id as o_org
  into tsk
  from delivery_tasks dt join orders o on o.id = dt.order_id
  where dt.id = task_id;
  if tsk.id is null then raise exception 'not_found'; end if;
  if not is_org_member(tsk.o_org) then raise exception 'not_allowed'; end if;

  select
    coalesce(sum(oi.quantity * coalesce(m.unit_weight_kg, 0)), 0),
    coalesce(sum(oi.quantity * coalesce(m.unit_volume_m3, 0)), 0),
    coalesce(sum(case when coalesce(m.units_per_pallet, 0) > 0
                      then ceil(oi.quantity / m.units_per_pallet) else 0 end), 0),
    coalesce(max(m.max_length_m), 0)
    into v_weight, v_volume, v_pallets, v_length
  from order_items oi left join materials m on m.id = oi.material_id
  where oi.order_id = tsk.order_id;

  v_crane := coalesce(tsk.requires_crane, false);

  -- smallest available vehicle that satisfies every hard filter
  select v.id, v.name, v.capacity_kg
    into best
  from vehicles v
  where v.org_id = tsk.o_org
    and v.status = 'available'
    and (v.capacity_kg is null or v.capacity_kg >= v_weight)
    and (v.capacity_m3 is null or v.capacity_m3 >= v_volume)
    and (v_length = 0 or v.max_item_length_m is null or v.max_item_length_m >= v_length)
    and (v_pallets = 0 or v.can_carry_pallets)
    and (not v_crane or v.has_crane)
  order by v.capacity_kg nulls last
  limit 1;

  return jsonb_build_object(
    'weight_kg', v_weight,
    'volume_m3', v_volume,
    'pallets', v_pallets,
    'max_length_m', v_length,
    'needs_crane', v_crane,
    'vehicle_id', best.id,
    'vehicle_name', best.name,
    'load_pct', case when best.capacity_kg is not null and best.capacity_kg > 0
                     then round(v_weight / best.capacity_kg * 100) else null end
  );
end $$;

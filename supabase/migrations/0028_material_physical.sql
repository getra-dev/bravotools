-- =====================================================
-- 0028 — OWNER AMENDMENT (2026-07-19): material physical
-- params for transport matching. weight/volume/max-length
-- already existed but weren't editable; add width, units
-- per pallet, and pallet type. These feed the greedy
-- vehicle suggestion (weight/volume/length/pallets).
-- =====================================================

alter table materials
  add column if not exists unit_width_m numeric,
  add column if not exists units_per_pallet numeric,
  add column if not exists pallet_type text;

-- update_material now also writes the physical params (all optional).
create or replace function public.update_material(material_id uuid, payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare target_org uuid; v_name text; v_mode text;
begin
  select org_id into target_org from materials where id = material_id;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  v_name := nullif(trim(payload->>'canonical_name'), '');
  if v_name is null then raise exception 'name_required'; end if;
  v_mode := coalesce(nullif(payload->>'supply_mode', ''),
                     (select supply_mode from materials where id = material_id));
  if v_mode not in ('stock', 'order') then raise exception 'invalid_mode'; end if;

  update materials
  set canonical_name = v_name,
      base_unit = coalesce(nullif(trim(payload->>'base_unit'), ''), base_unit),
      category = nullif(trim(payload->>'category'), ''),
      supply_mode = v_mode,
      unit_weight_kg = nullif(replace(payload->>'unit_weight_kg', ',', '.'), '')::numeric,
      unit_volume_m3 = nullif(replace(payload->>'unit_volume_m3', ',', '.'), '')::numeric,
      max_length_m = nullif(replace(payload->>'max_length_m', ',', '.'), '')::numeric,
      unit_width_m = nullif(replace(payload->>'unit_width_m', ',', '.'), '')::numeric,
      units_per_pallet = nullif(replace(payload->>'units_per_pallet', ',', '.'), '')::numeric,
      pallet_type = nullif(trim(payload->>'pallet_type'), '')
  where id = material_id;
end $$;

-- =====================================================
-- 0022 — OWNER AMENDMENT (2026-07-19): a material is either
-- a stock item (kept on the shelf) or a special-order item
-- (bought per need, longer lead). This drives the "own
-- stock first" logic (block C) and expected-date defaults.
-- =====================================================

alter table materials
  add column if not exists supply_mode text not null default 'order'
    check (supply_mode in ('stock', 'order'));

-- create_material gains an optional mode (default 'order' keeps existing
-- callers — confirm-from-text, dispatcher create — working unchanged).
-- Drop the 4-arg overload so a 4-arg call is not ambiguous.
drop function if exists public.create_material(uuid, text, text, text);
create or replace function public.create_material(
  target_org uuid, m_name text, m_unit text default 'vnt',
  m_category text default null, m_mode text default 'order')
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; v_mode text;
begin
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  if coalesce(trim(m_name), '') = '' then raise exception 'name_required'; end if;
  v_mode := coalesce(nullif(m_mode, ''), 'order');
  if v_mode not in ('stock', 'order') then raise exception 'invalid_mode'; end if;

  insert into materials (org_id, canonical_name, base_unit, category, supply_mode)
  values (target_org, trim(m_name), coalesce(nullif(trim(m_unit), ''), 'vnt'),
          nullif(trim(coalesce(m_category, '')), ''), v_mode)
  returning id into new_id;
  return new_id;
end $$;

-- update_material also sets the mode
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
  -- keep the current mode when the caller omits it
  v_mode := coalesce(nullif(payload->>'supply_mode', ''),
                     (select supply_mode from materials where id = material_id));
  if v_mode not in ('stock', 'order') then raise exception 'invalid_mode'; end if;

  update materials
  set canonical_name = v_name,
      base_unit = coalesce(nullif(trim(payload->>'base_unit'), ''), base_unit),
      category = nullif(trim(payload->>'category'), ''),
      supply_mode = v_mode
  where id = material_id;
end $$;

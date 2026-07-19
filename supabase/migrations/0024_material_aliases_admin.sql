-- =====================================================
-- 0024 — OWNER QUESTION (2026-07-19): a material may be
-- called differently by a vendor or by accounting. The
-- fuzzy matcher already LEARNS aliases on confirm; this
-- adds manual management so the supply side can seed and
-- prune them. (material_aliases + aliases_org_select exist.)
-- =====================================================

create or replace function public.add_material_alias(material_id uuid, p_alias text)
returns void
language plpgsql security definer set search_path = public as $$
declare target_org uuid; v_alias text;
begin
  select org_id into target_org from materials where id = material_id;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  v_alias := lower(nullif(trim(p_alias), ''));
  if v_alias is null then raise exception 'alias_required'; end if;

  insert into material_aliases (org_id, material_id, alias, source, confirmed)
  values (target_org, material_id, v_alias, 'manual', true)
  on conflict (org_id, alias) do update set material_id = excluded.material_id, confirmed = true;
end $$;

create or replace function public.remove_material_alias(alias_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare target_org uuid;
begin
  select org_id into target_org from material_aliases where id = alias_id;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  delete from material_aliases where id = alias_id;
end $$;

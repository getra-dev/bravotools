-- =====================================================
-- 0020 — Etapas 2 (A): vendor administration. vendors rows
-- existed (seeded) but there was no way to create/edit them.
-- Supply side manages vendors; RPCs are the gated write path.
-- (vendors_org_select already lets any org member read them.)
-- =====================================================

create or replace function public.create_vendor(target_org uuid, payload jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  v_name text;
  v_method text;
  v_types text[];
begin
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  v_name := nullif(trim(payload->>'name'), '');
  if v_name is null then raise exception 'name_required'; end if;

  v_method := coalesce(nullif(payload->>'order_method', ''), 'email');
  if v_method not in ('email', 'csv', 'api', 'manual') then
    raise exception 'invalid_method';
  end if;

  -- types is a text[] (rental / materials / service); default materials
  select coalesce(
    array(select jsonb_array_elements_text(nullif(payload->'type', 'null'::jsonb))),
    array['materials']
  ) into v_types;

  insert into vendors (org_id, name, type, email, phone, order_method,
                       default_lead_time_days, notes)
  values (target_org, v_name, v_types,
          nullif(trim(payload->>'email'), ''),
          nullif(trim(payload->>'phone'), ''),
          v_method,
          nullif(payload->>'default_lead_time_days', '')::integer,
          nullif(trim(payload->>'notes'), ''))
  returning id into new_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'vendor', new_id, 'user', auth.uid(), 'created',
          jsonb_build_object('name', v_name));
  return new_id;
end $$;

create or replace function public.update_vendor(vendor_id uuid, payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  target_org uuid;
  v_name text;
  v_method text;
  v_types text[];
begin
  select org_id into target_org from vendors where id = vendor_id;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  v_name := nullif(trim(payload->>'name'), '');
  if v_name is null then raise exception 'name_required'; end if;
  v_method := coalesce(nullif(payload->>'order_method', ''), 'email');
  if v_method not in ('email', 'csv', 'api', 'manual') then
    raise exception 'invalid_method';
  end if;
  select coalesce(
    array(select jsonb_array_elements_text(nullif(payload->'type', 'null'::jsonb))),
    array['materials']
  ) into v_types;

  update vendors
  set name = v_name,
      type = v_types,
      email = nullif(trim(payload->>'email'), ''),
      phone = nullif(trim(payload->>'phone'), ''),
      order_method = v_method,
      default_lead_time_days = nullif(payload->>'default_lead_time_days', '')::integer,
      notes = nullif(trim(payload->>'notes'), '')
  where id = vendor_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'vendor', vendor_id, 'user', auth.uid(), 'updated',
          jsonb_build_object('name', v_name));
end $$;

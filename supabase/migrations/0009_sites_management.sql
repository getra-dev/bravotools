-- =====================================================
-- 0009 — SPEC 2.8b: sites/locations management
-- CRUD via role-gated RPCs (owner/admin/supply_manager),
-- responsibles via site_assignments (+ org read policy).
-- =====================================================

create or replace function public.assert_location_editor(target_org uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare caller_role text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select role into caller_role
  from memberships where org_id = target_org and user_id = auth.uid();
  if caller_role is null or caller_role not in ('owner','admin','supply_manager') then
    raise exception 'not_allowed';
  end if;
end $$;

create or replace function public.create_location(target_org uuid, payload jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  v_name text;
  v_type text;
begin
  perform assert_location_editor(target_org);

  v_name := nullif(trim(payload->>'name'), '');
  if v_name is null then raise exception 'name_required'; end if;
  v_type := coalesce(nullif(payload->>'type', ''), 'site');
  if v_type not in ('site', 'warehouse', 'service') then
    raise exception 'invalid_type';
  end if;

  insert into locations (org_id, type, name, address, latitude, longitude, is_active)
  values (target_org, v_type, v_name,
          nullif(trim(payload->>'address'), ''),
          nullif(replace(payload->>'latitude', ',', '.'), '')::numeric,
          nullif(replace(payload->>'longitude', ',', '.'), '')::numeric,
          coalesce((payload->>'is_active')::boolean, true))
  returning id into new_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'location', new_id, 'user', auth.uid(), 'created',
          jsonb_build_object('name', v_name, 'type', v_type));
  return new_id;
end $$;

create or replace function public.update_location(location_id uuid, payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  target_org uuid;
  v_name text;
  v_type text;
begin
  select org_id into target_org from locations where id = location_id;
  if target_org is null then raise exception 'not_found'; end if;
  perform assert_location_editor(target_org);

  v_name := nullif(trim(payload->>'name'), '');
  if v_name is null then raise exception 'name_required'; end if;
  v_type := coalesce(nullif(payload->>'type', ''), 'site');
  if v_type not in ('site', 'warehouse', 'service') then
    raise exception 'invalid_type';
  end if;

  update locations set
    name = v_name,
    type = v_type,
    address = nullif(trim(payload->>'address'), ''),
    latitude = nullif(replace(payload->>'latitude', ',', '.'), '')::numeric,
    longitude = nullif(replace(payload->>'longitude', ',', '.'), '')::numeric,
    is_active = coalesce((payload->>'is_active')::boolean, true)
  where id = location_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'location', location_id, 'user', auth.uid(), 'updated',
          jsonb_build_object('name', v_name));
end $$;

create or replace function public.assign_site_member(
  target_site uuid, target_user uuid, manager boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare target_org uuid;
begin
  select org_id into target_org from locations where id = target_site;
  if target_org is null then raise exception 'not_found'; end if;
  perform assert_location_editor(target_org);
  if not exists (select 1 from memberships
                 where org_id = target_org and user_id = target_user) then
    raise exception 'not_a_member';
  end if;

  insert into site_assignments (org_id, site_id, user_id, is_manager)
  values (target_org, target_site, target_user, manager)
  on conflict (site_id, user_id) do update set is_manager = excluded.is_manager;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'location', target_site, 'user', auth.uid(), 'member_assigned',
          jsonb_build_object('user_id', target_user, 'is_manager', manager));
end $$;

create or replace function public.remove_site_assignment(target_site uuid, target_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare target_org uuid;
begin
  select org_id into target_org from locations where id = target_site;
  if target_org is null then raise exception 'not_found'; end if;
  perform assert_location_editor(target_org);

  delete from site_assignments where site_id = target_site and user_id = target_user;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'location', target_site, 'user', auth.uid(), 'member_unassigned',
          jsonb_build_object('user_id', target_user));
end $$;

-- org members see who is responsible for which site (roles matrix §1
-- visibility checks also read this via is_assigned_to_site)
create policy site_assignments_org_select on site_assignments
  for select using (is_org_member(org_id));

-- Test: SPEC 2.8b sites management (migration 0009).
-- Covers: create/update location role gate, assignment upsert with manager
-- flag, removal, org visibility of assignments, outsider isolation.
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('abababab-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'boss@t28.local', now(), now()),
  ('abababab-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t28.local', now(), now()),
  ('abababab-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outsider@t28.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"abababab-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t28_ctx as
  select create_organization('T28 Sites Org') as org_id;

do $$
declare org uuid;
begin
  select org_id into org from t28_ctx;
  perform invite_member(org, 'worker@t28.local', 'worker');
end $$;

-- ---------- create + update + assign ----------
do $$
declare org uuid; site uuid;
begin
  select org_id into org from t28_ctx;

  select create_location(org, '{"name":"Objektas: Testo g. 1","type":"site","address":"Testo g. 1, Vilnius","latitude":"54,7","longitude":"25,3"}'::jsonb)
    into site;
  if (select latitude from locations where id = site) <> 54.7 then
    raise exception 'FAIL: comma coordinate not parsed';
  end if;

  perform update_location(site, '{"name":"Objektas: Testo g. 1A","type":"site","is_active":"true"}'::jsonb);
  if (select name from locations where id = site) <> 'Objektas: Testo g. 1A' then
    raise exception 'FAIL: update_location did not rename';
  end if;

  perform assign_site_member(site, 'abababab-0000-0000-0000-00000000000b', false);
  perform assign_site_member(site, 'abababab-0000-0000-0000-00000000000b', true);
  if (select count(*) from site_assignments where site_id = site) <> 1 then
    raise exception 'FAIL: assignment not upserted';
  end if;
  if (select is_manager from site_assignments
      where site_id = site and user_id = 'abababab-0000-0000-0000-00000000000b') is not true then
    raise exception 'FAIL: manager flag not updated';
  end if;

  begin
    perform assign_site_member(site, 'abababab-0000-0000-0000-00000000000c', false);
    raise exception 'FAIL: non-member was assigned to a site';
  exception when others then
    if sqlerrm not like '%not_a_member%' then raise; end if;
  end;
end $$;

-- ---------- worker: sees assignments, cannot manage ----------
set local request.jwt.claims =
  '{"sub":"abababab-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare org uuid; site uuid; n integer;
begin
  select org_id into org from t28_ctx;
  select id into site from locations where org_id = org limit 1;

  select count(*) into n from site_assignments where site_id = site;
  if n <> 1 then
    raise exception 'FAIL: worker cannot see own site assignment (%)', n;
  end if;

  begin
    perform create_location(org, '{"name":"Sneaky site"}'::jsonb);
    raise exception 'FAIL: worker created a location';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
  begin
    perform remove_site_assignment(site, 'abababab-0000-0000-0000-00000000000b');
    raise exception 'FAIL: worker removed an assignment';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- ---------- outsider sees nothing ----------
set local request.jwt.claims =
  '{"sub":"abababab-0000-0000-0000-00000000000c","role":"authenticated"}';

do $$
declare org uuid; n integer;
begin
  select org_id into org from t28_ctx;
  select count(*) into n from site_assignments where org_id = org;
  if n <> 0 then raise exception 'FAIL: outsider sees site assignments'; end if;
end $$;

-- ---------- removal works for the boss ----------
set local request.jwt.claims =
  '{"sub":"abababab-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare org uuid; site uuid;
begin
  select org_id into org from t28_ctx;
  select id into site from locations where org_id = org limit 1;
  perform remove_site_assignment(site, 'abababab-0000-0000-0000-00000000000b');
  if (select count(*) from site_assignments where site_id = site) <> 0 then
    raise exception 'FAIL: assignment not removed';
  end if;
end $$;

reset role;
rollback;

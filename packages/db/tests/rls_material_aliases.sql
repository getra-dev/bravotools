-- Test: E2 manual material aliases (0024).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('b2b2b2b2-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@t9.local', now(), now()),
  ('b2b2b2b2-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t9.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"b2b2b2b2-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t9 as select create_organization('T9 Alias Org') as org_id;
do $$
declare org uuid;
begin
  select org_id into org from t9;
  perform invite_member(org, 'worker@t9.local', 'worker');
  perform create_material(org, 'Gipso kartono plokštė 12.5mm', 'vnt', 'gipsas', 'order');
end $$;

-- worker cannot add an alias
set local request.jwt.claims =
  '{"sub":"b2b2b2b2-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare org uuid; mid uuid;
begin
  select org_id into org from t9;
  select id into mid from materials where org_id = org limit 1;
  begin
    perform add_material_alias(mid, 'gipsokartonis');
    raise exception 'FAIL: worker added an alias';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- supply adds (normalised lowercase), then removes
set local request.jwt.claims =
  '{"sub":"b2b2b2b2-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare org uuid; mid uuid; aid uuid;
begin
  select org_id into org from t9;
  select id into mid from materials where org_id = org limit 1;

  perform add_material_alias(mid, '  GKP 12.5  ');
  select id into aid from material_aliases where org_id = org and alias = 'gkp 12.5';
  if aid is null then raise exception 'FAIL: alias not stored lowercased/trimmed'; end if;
  if (select confirmed from material_aliases where id = aid) is not true then
    raise exception 'FAIL: manual alias not confirmed';
  end if;

  -- the fuzzy matcher now finds the material by the vendor/accounting name
  if not exists (
    select 1 from suggest_material_matches(org, 'GKP 12.5') where material_id = mid
  ) then
    raise exception 'FAIL: alias not usable by matcher';
  end if;

  perform remove_material_alias(aid);
  if exists (select 1 from material_aliases where id = aid) then
    raise exception 'FAIL: alias not removed';
  end if;
end $$;

reset role;
rollback;

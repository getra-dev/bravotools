-- Test: E2 material physical params (0028).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('c6c6c6c6-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@td.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"c6c6c6c6-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table td as select create_organization('TD Phys Org') as org_id;

do $$
declare org uuid; mid uuid;
begin
  select org_id into org from td;
  select create_material(org, 'OSB plokštė', 'vnt', 'plokštės', 'stock') into mid;

  perform update_material(mid, jsonb_build_object(
    'canonical_name', 'OSB plokštė 18mm',
    'unit_weight_kg', '19.5',
    'unit_volume_m3', '0.056',
    'max_length_m', '2.5',
    'unit_width_m', '1.25',
    'units_per_pallet', '50',
    'pallet_type', 'EUR'));

  if (select unit_weight_kg from materials where id = mid) <> 19.5 then
    raise exception 'FAIL: weight not stored';
  end if;
  if (select max_length_m from materials where id = mid) <> 2.5 then
    raise exception 'FAIL: length not stored';
  end if;
  if (select unit_width_m from materials where id = mid) <> 1.25 then
    raise exception 'FAIL: width not stored';
  end if;
  if (select units_per_pallet from materials where id = mid) <> 50 then
    raise exception 'FAIL: pallet qty not stored';
  end if;
  if (select pallet_type from materials where id = mid) <> 'EUR' then
    raise exception 'FAIL: pallet type not stored';
  end if;
end $$;

reset role;
rollback;

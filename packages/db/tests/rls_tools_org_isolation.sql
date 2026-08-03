-- RLS test: tools org isolation.
-- Proves: (1) org member sees only own-org tools via policy tools_org_select;
--         (2) without the policy access is denied (deny-by-default);
--         (3) RLS-enabled table with no policy (platform_admins) is invisible.
-- Runs inside one transaction and rolls back — leaves no trace.
begin;

-- ---------- fixtures (as postgres, bypassing RLS) ----------
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-user-a@test.local', now(), now()),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-user-b@test.local', now(), now());

insert into profiles (id, full_name)
values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'RLS User A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'RLS User B')
on conflict (id) do nothing;

insert into organizations (id, name) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'RLS Org A'),
  ('bbbbbbbb-1111-0000-0000-000000000002', 'RLS Org B');

insert into memberships (org_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'owner'),
  ('bbbbbbbb-1111-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b', 'owner');

insert into tools (id, org_id, name) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'RLS Tool A'),
  ('bbbbbbbb-2222-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000002', 'RLS Tool B');

insert into locations (id, org_id, type, name) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
   'warehouse', 'RLS Warehouse A');

-- platform_admins has NO client policy — our deny-by-default probe
-- (it must NEVER become visible to org users)
insert into platform_admins (user_id, note) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'rls probe');

-- ---------- act as user A ----------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from tools;
  if n <> 1 then
    raise exception 'FAIL: user A sees % tools, expected exactly 1 (own org)', n;
  end if;
  if not exists (select 1 from tools where name = 'RLS Tool A') then
    raise exception 'FAIL: user A cannot see own-org tool';
  end if;
  if exists (select 1 from tools where name = 'RLS Tool B') then
    raise exception 'FAIL: cross-org leak — user A sees org B tool';
  end if;

  -- platform_admins has RLS enabled and no client policy ⇒ must be invisible
  select count(*) into n from platform_admins;
  if n <> 0 then
    raise exception 'FAIL: deny-by-default broken — % platform_admins visible without policy', n;
  end if;
end $$;

-- ---------- red without policy ----------
reset role;
-- 0035 pervadino šitą politiką (buvo org_members_all, FOR ALL — leido
-- darbininkui ir rašyti). Dabar tik SELECT.
drop policy tools_org_select on tools;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from tools;
  if n <> 0 then
    raise exception 'FAIL: policy dropped but user A still sees % tools', n;
  end if;
end $$;

reset role;
rollback;

-- RLS test: SPEC 2.1 auth & org foundation (migration 0002).
-- Covers: signup trigger creates profile; create_organization RPC;
-- invite_member (existing user + pending invitation auto-accept);
-- org/membership/profile isolation between orgs; worker cannot invite.
-- Runs in one transaction, rolls back.
begin;

-- ---------- fixtures: two fresh signups (trigger creates profiles) ----------
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('cccccccc-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'founder-a@t21.local', now(), now()),
  ('cccccccc-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'founder-b@t21.local', now(), now());

do $$
begin
  if (select count(*) from profiles
      where id in ('cccccccc-0000-0000-0000-00000000000a',
                   'cccccccc-0000-0000-0000-00000000000b')) <> 2 then
    raise exception 'FAIL: signup trigger did not auto-create profiles';
  end if;
  if (select locale from profiles where id = 'cccccccc-0000-0000-0000-00000000000a') <> 'lt' then
    raise exception 'FAIL: profile locale default is not lt';
  end if;
end $$;

-- ---------- founder A creates an org via RPC ----------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"cccccccc-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t21_ctx as
  select create_organization('T21 Org A') as org_a;

do $$
declare org uuid; n integer;
begin
  select org_a into org from t21_ctx;
  if not exists (select 1 from memberships
                 where org_id = org and user_id = 'cccccccc-0000-0000-0000-00000000000a'
                   and role = 'owner') then
    raise exception 'FAIL: create_organization did not create owner membership';
  end if;
  select count(*) into n from organizations where id = org;
  if n <> 1 then
    raise exception 'FAIL: owner cannot see own organization via RLS';
  end if;
end $$;

-- ---------- invite: existing user → instant membership ----------
do $$
declare org uuid; res text;
begin
  select org_a into org from t21_ctx;
  select invite_member(org, 'founder-b@t21.local', 'worker') into res;
  if res <> 'added' then
    raise exception 'FAIL: invite of existing user returned % (expected added)', res;
  end if;
end $$;

-- ---------- invite: unknown email → pending, auto-accepted at signup ----------
do $$
declare org uuid; res text;
begin
  select org_a into org from t21_ctx;
  select invite_member(org, 'newhire@t21.local', 'driver') into res;
  if res <> 'invited' then
    raise exception 'FAIL: invite of unknown email returned % (expected invited)', res;
  end if;
end $$;

reset role;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('cccccccc-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'newhire@t21.local', now(), now());

do $$
declare org uuid;
begin
  select org_a into org from t21_ctx;
  if not exists (select 1 from memberships
                 where org_id = org and user_id = 'cccccccc-0000-0000-0000-00000000000c'
                   and role = 'driver') then
    raise exception 'FAIL: pending invitation was not auto-accepted at signup';
  end if;
  if exists (select 1 from org_invitations
             where org_id = org and email = 'newhire@t21.local' and status <> 'accepted') then
    raise exception 'FAIL: invitation status not marked accepted';
  end if;
end $$;

-- ---------- isolation: outsider (own org founder) sees nothing of org A ----------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"cccccccc-0000-0000-0000-00000000000b","role":"authenticated"}';

-- b is now a worker in org A (invited above) — so first check a TRUE outsider:
reset role;
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('cccccccc-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outsider@t21.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"cccccccc-0000-0000-0000-00000000000d","role":"authenticated"}';

do $$
declare org uuid; n integer;
begin
  select org_a into org from t21_ctx;
  select count(*) into n from organizations where id = org;
  if n <> 0 then raise exception 'FAIL: outsider sees org A organization row'; end if;
  select count(*) into n from memberships where org_id = org;
  if n <> 0 then raise exception 'FAIL: outsider sees org A memberships'; end if;
  select count(*) into n from profiles where id = 'cccccccc-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'FAIL: outsider sees org A founder profile'; end if;
  select count(*) into n from org_invitations where org_id = org;
  if n <> 0 then raise exception 'FAIL: outsider sees org A invitations'; end if;
end $$;

-- ---------- permission: worker cannot invite ----------
set local request.jwt.claims =
  '{"sub":"cccccccc-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare org uuid; res text;
begin
  select org_a into org from t21_ctx;
  begin
    select invite_member(org, 'sneaky@t21.local', 'worker') into res;
    raise exception 'FAIL: worker was allowed to invite';
  exception
    when others then
      if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

reset role;
rollback;

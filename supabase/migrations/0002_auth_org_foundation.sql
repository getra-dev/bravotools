-- =====================================================
-- 0002 — SPEC 2.1: Auth & org foundation
-- 1) profiles auto-created on signup (locale 'lt')
-- 2) create_organization RPC (first user → owner)
-- 3) org_invitations + invite RPC + auto-accept on signup
-- 4) RLS policies: organizations / memberships / profiles /
--    org_invitations / plan_limits (read)
-- All client writes for org lifecycle go through security-definer
-- RPCs; tables stay closed (no insert/update policies).
-- =====================================================

-- ---------- 1. profiles trigger ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, locale)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'lt')
  on conflict (id) do nothing;

  -- auto-accept pending invitations for this email
  insert into public.memberships (org_id, user_id, role)
  select i.org_id, new.id, i.role
  from public.org_invitations i
  where lower(i.email) = lower(new.email) and i.status = 'pending'
  on conflict (org_id, user_id) do nothing;

  update public.org_invitations
  set status = 'accepted', accepted_at = now()
  where lower(email) = lower(new.email) and status = 'pending';

  return new;
end $$;

-- org_invitations must exist before the trigger body can reference it
create table org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null default 'worker'
    check (role in ('admin','supply_manager','site_manager','driver','worker')),
  invited_by uuid not null references profiles(id),
  status text not null default 'pending'
    check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (org_id, email)
);

alter table org_invitations enable row level security;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 2. create_organization RPC ----------

create or replace function public.create_organization(org_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if coalesce(trim(org_name), '') = '' then
    raise exception 'organization_name_required';
  end if;

  insert into organizations (name) values (trim(org_name)) returning id into new_org;
  insert into memberships (org_id, user_id, role) values (new_org, auth.uid(), 'owner');
  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (new_org, 'organization', new_org, 'user', auth.uid(), 'created',
          jsonb_build_object('name', trim(org_name)));
  return new_org;
end $$;

-- ---------- 3. invite_member RPC ----------
-- Owner/admin invites by email. If the user already exists → membership
-- immediately; otherwise a pending invitation auto-accepted at signup.

create or replace function public.invite_member(target_org uuid, invite_email text, invite_role text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  existing_user uuid;
  caller_role text;
  clean_email text := lower(trim(invite_email));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select role into caller_role from memberships
  where org_id = target_org and user_id = auth.uid();
  if caller_role is null or caller_role not in ('owner','admin') then
    raise exception 'not_allowed';
  end if;

  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;
  if invite_role not in ('admin','supply_manager','site_manager','driver','worker') then
    raise exception 'invalid_role';
  end if;

  select u.id into existing_user from auth.users u where lower(u.email) = clean_email;

  if existing_user is not null then
    insert into memberships (org_id, user_id, role)
    values (target_org, existing_user, invite_role)
    on conflict (org_id, user_id) do nothing;

    insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
    values (target_org, 'membership', existing_user, 'user', auth.uid(), 'member_added',
            jsonb_build_object('email', clean_email, 'role', invite_role));
    return 'added';
  end if;

  insert into org_invitations (org_id, email, role, invited_by)
  values (target_org, clean_email, invite_role, auth.uid())
  on conflict (org_id, email) do update
    set role = excluded.role, status = 'pending', accepted_at = null;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'organization', target_org, 'user', auth.uid(), 'invitation_sent',
          jsonb_build_object('email', clean_email, 'role', invite_role));
  return 'invited';
end $$;

-- ---------- 4. helpers + RLS policies ----------

-- do the two users share at least one org? (security definer avoids
-- RLS recursion when used inside profiles policy)
create or replace function public.shares_org_with(other uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from memberships m1
    join memberships m2 on m1.org_id = m2.org_id
    where m1.user_id = auth.uid() and m2.user_id = other
  );
$$;

-- 0001 enabled RLS on every table EXCEPT profiles — close that hole
alter table profiles enable row level security;

create policy org_member_select on organizations
  for select using (is_org_member(id));

create policy memberships_select on memberships
  for select using (user_id = auth.uid() or is_org_member(org_id));

create policy profiles_select on profiles
  for select using (id = auth.uid() or shares_org_with(id));

create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy invitations_select on org_invitations
  for select using (is_org_member(org_id));

-- plan limits are public read-only reference data (SPEC §1)
create policy plan_limits_read on plan_limits
  for select using (true);

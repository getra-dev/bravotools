-- =====================================================
-- 0033 — Etapas 2 (SPEC 3.6, blokas 1): Vendor 360 kontaktai.
-- Vienas tiekėjas = daug atsakingų žmonių (vienas dėl blokelių,
-- kitas dėl akmens vatos). `handles` = materials.category reikšmės,
-- už kurias tas žmogus atsako → PO laiškas keliauja jam, ne į
-- bendrą info@. Fallback grandinė: handles ∩ užsakymo kategorijos →
-- is_primary kontaktas → vendors.email.
-- =====================================================

create table if not exists vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  name text not null,
  position text,                           -- "vadybininkas", "sandėlio vadovas"
  email text,
  phone text,
  handles text[] not null default '{}',    -- materials.category reikšmės
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

alter table vendor_contacts enable row level security;

create index if not exists vendor_contacts_vendor_idx
  on vendor_contacts (vendor_id, is_primary desc, name);

create policy vendor_contacts_org_select on vendor_contacts
  for select using (is_org_member(org_id));

-- kuris kontaktas gavo laišką — įrodymų grandinėje
alter table outbound_messages
  add column if not exists contact_id uuid references vendor_contacts(id) on delete set null;

-- ---------- rašymo kelias (tik supply) ----------

create or replace function public.create_vendor_contact(args jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid := (args->>'vendor_id')::uuid;
  target_org uuid;
  v_name text;
  v_handles text[];
  v_primary boolean := coalesce((args->>'is_primary')::boolean, false);
  new_id uuid;
begin
  select org_id into target_org from vendors where id = v_vendor;
  if target_org is null then raise exception 'vendor_not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  v_name := nullif(trim(args->>'name'), '');
  if v_name is null then raise exception 'name_required'; end if;

  select coalesce(
    array(select distinct nullif(trim(h), '')
          from jsonb_array_elements_text(coalesce(nullif(args->'handles', 'null'::jsonb), '[]'::jsonb)) as h
          where nullif(trim(h), '') is not null),
    '{}'::text[]
  ) into v_handles;

  insert into vendor_contacts (org_id, vendor_id, name, position, email, phone, handles, is_primary)
  values (target_org, v_vendor, v_name,
          nullif(trim(args->>'position'), ''),
          nullif(trim(args->>'email'), ''),
          nullif(trim(args->>'phone'), ''),
          v_handles, v_primary)
  returning id into new_id;

  -- tik vienas pagrindinis kontaktas per tiekėją
  if v_primary then
    update vendor_contacts set is_primary = false
    where vendor_id = v_vendor and id <> new_id and is_primary;
  end if;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'vendor', v_vendor, 'user', auth.uid(), 'contact_added',
          jsonb_build_object('contact_id', new_id, 'name', v_name, 'handles', v_handles));
  return new_id;
end $$;

create or replace function public.update_vendor_contact(args jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid := (args->>'contact_id')::uuid;
  target_org uuid;
  v_vendor uuid;
  v_name text;
  v_handles text[];
  v_primary boolean := coalesce((args->>'is_primary')::boolean, false);
begin
  select org_id, vendor_id into target_org, v_vendor from vendor_contacts where id = v_contact;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  v_name := nullif(trim(args->>'name'), '');
  if v_name is null then raise exception 'name_required'; end if;

  select coalesce(
    array(select distinct nullif(trim(h), '')
          from jsonb_array_elements_text(coalesce(nullif(args->'handles', 'null'::jsonb), '[]'::jsonb)) as h
          where nullif(trim(h), '') is not null),
    '{}'::text[]
  ) into v_handles;

  update vendor_contacts set
    name = v_name,
    position = nullif(trim(args->>'position'), ''),
    email = nullif(trim(args->>'email'), ''),
    phone = nullif(trim(args->>'phone'), ''),
    handles = v_handles,
    is_primary = v_primary
  where id = v_contact;

  if v_primary then
    update vendor_contacts set is_primary = false
    where vendor_id = v_vendor and id <> v_contact and is_primary;
  end if;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'vendor', v_vendor, 'user', auth.uid(), 'contact_updated',
          jsonb_build_object('contact_id', v_contact, 'name', v_name, 'handles', v_handles));
end $$;

create or replace function public.remove_vendor_contact(contact_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  target_org uuid;
  v_vendor uuid;
  v_name text;
begin
  select org_id, vendor_id, name into target_org, v_vendor, v_name
  from vendor_contacts where id = contact_id;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  delete from vendor_contacts where id = contact_id;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'vendor', v_vendor, 'user', auth.uid(), 'contact_removed',
          jsonb_build_object('contact_id', contact_id, 'name', v_name));
end $$;

-- ---------- maršrutizavimas: kam siųsti šitą PO ----------
-- Grąžina kontaktą (arba tiekėjo bendrą el. paštą), pagal kurį
-- order-email-actions adresuoja laišką. Skaitymo funkcija — gali
-- kviesti bet kuris org narys.
create or replace function public.pick_order_contact(order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ord record;
  cats text[];
  hit record;
begin
  select o.id, o.org_id, o.vendor_id, v.email as vendor_email, v.name as vendor_name
    into ord
  from orders o
  left join vendors v on v.id = o.vendor_id
  where o.id = order_id;
  if ord.id is null then raise exception 'not_found'; end if;
  if not is_org_member(ord.org_id) then raise exception 'not_allowed'; end if;
  if ord.vendor_id is null then
    return jsonb_build_object('to_address', null, 'contact_id', null, 'match', 'none');
  end if;

  -- užsakymo eilučių medžiagų kategorijos
  select coalesce(array_agg(distinct m.category) filter (where m.category is not null), '{}')
    into cats
  from order_items oi
  join materials m on m.id = oi.material_id
  where oi.order_id = ord.id;

  -- 1) kontaktas, kurio handles kertasi su užsakymo kategorijomis
  if array_length(cats, 1) is not null then
    select c.id, c.name, c.email into hit
    from vendor_contacts c
    where c.vendor_id = ord.vendor_id
      and c.email is not null
      and c.handles && cats
    order by c.is_primary desc, c.name
    limit 1;
    if hit.id is not null then
      return jsonb_build_object('to_address', hit.email, 'contact_id', hit.id,
                                'contact_name', hit.name, 'match', 'handles');
    end if;
  end if;

  -- 2) pagrindinis kontaktas
  select c.id, c.name, c.email into hit
  from vendor_contacts c
  where c.vendor_id = ord.vendor_id and c.email is not null and c.is_primary
  limit 1;
  if hit.id is not null then
    return jsonb_build_object('to_address', hit.email, 'contact_id', hit.id,
                              'contact_name', hit.name, 'match', 'primary');
  end if;

  -- 3) bendras tiekėjo el. paštas
  return jsonb_build_object('to_address', ord.vendor_email, 'contact_id', null,
                            'contact_name', null, 'match', 'vendor');
end $$;

-- record_order_sent papildomas kontakto nuoroda įrodymų eilutėje
create or replace function public.record_order_sent(args jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid := (args->>'order_id')::uuid;
  ord record;
  msg_id uuid;
  v_contact uuid := nullif(args->>'contact_id', '')::uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into ord from orders where id = v_order;
  if ord.id is null then raise exception 'not_found'; end if;
  if not is_supply(ord.org_id) then raise exception 'not_allowed'; end if;
  if ord.status in ('delivered', 'cancelled') then raise exception 'order_closed'; end if;
  if v_contact is not null and not exists (
    select 1 from vendor_contacts where id = v_contact and org_id = ord.org_id) then
    raise exception 'contact_not_found';
  end if;

  insert into outbound_messages
    (org_id, channel, to_address, subject, entity_type, entity_id,
     sent_by_type, sent_by, provider_message_id, status, status_updated_at,
     body_storage_path, contact_id)
  values
    (ord.org_id, 'email', args->>'to_address', args->>'subject', 'order', v_order,
     'user', auth.uid(), nullif(args->>'provider_message_id', ''), 'sent', now(),
     nullif(args->>'body_storage_path', ''), v_contact)
  returning id into msg_id;

  if ord.status in ('requested', 'approved') then
    update orders
    set status = 'ordered', confirmed_at = now(),
        vendor_id = coalesce(nullif(args->>'vendor_id', '')::uuid, vendor_id)
    where id = v_order;
  end if;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (ord.org_id, 'order', v_order, 'user', auth.uid(), 'email_sent',
          jsonb_build_object('to', args->>'to_address', 'message_id', msg_id,
                             'contact_id', v_contact));
  return jsonb_build_object('message_id', msg_id);
end $$;

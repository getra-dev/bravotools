-- =====================================================
-- 0032 — Etapas 2 (3.4c-5): external / hired transport.
-- delivery_method already had own_vehicle|vendor_delivers|
-- hired — wire it. vendor_delivers = no own vehicle (ETA
-- from the PO). hired = a carrier (a vendor) + cost, and an
-- optional transport-order email reusing the PO mailer.
-- =====================================================

alter table delivery_tasks
  add column if not exists carrier_vendor_id uuid references vendors(id) on delete set null,
  add column if not exists transport_cost numeric;

create or replace function public.set_delivery_method(args jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_task uuid := (args->>'task_id')::uuid;
  target_org uuid;
  v_method text := args->>'method';
  v_carrier uuid := nullif(args->>'carrier_vendor_id', '')::uuid;
begin
  select org_id into target_org from delivery_tasks where id = v_task;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  if v_method not in ('own_vehicle', 'vendor_delivers', 'hired') then
    raise exception 'invalid_method';
  end if;
  if v_method = 'hired' and v_carrier is null then raise exception 'carrier_required'; end if;
  if v_carrier is not null and not exists (
    select 1 from vendors where id = v_carrier and org_id = target_org) then
    raise exception 'vendor_not_found';
  end if;

  update delivery_tasks set
    delivery_method = v_method,
    carrier_vendor_id = case when v_method = 'hired' then v_carrier else null end,
    transport_cost = case when v_method = 'hired'
      then nullif(replace(args->>'cost', ',', '.'), '')::numeric else null end,
    -- own vehicle no longer applies once vendor/hired carries it
    vehicle_id = case when v_method = 'own_vehicle' then vehicle_id else null end
  where id = v_task;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'delivery_task', v_task, 'user', auth.uid(), 'method_set',
          jsonb_build_object('method', v_method, 'carrier', v_carrier));
end $$;

-- proof row when a transport order is emailed to a hired carrier
create or replace function public.record_transport_sent(args jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_task uuid := (args->>'task_id')::uuid;
  target_org uuid;
begin
  select org_id into target_org from delivery_tasks where id = v_task;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  insert into outbound_messages
    (org_id, channel, to_address, subject, entity_type, entity_id,
     sent_by_type, sent_by, provider_message_id, status, status_updated_at)
  values
    (target_org, 'email', args->>'to_address', args->>'subject', 'delivery_task', v_task,
     'user', auth.uid(), nullif(args->>'provider_message_id', ''), 'sent', now());

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'delivery_task', v_task, 'user', auth.uid(), 'transport_ordered',
          jsonb_build_object('to', args->>'to_address'));
end $$;

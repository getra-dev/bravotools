-- =====================================================
-- 0031 — Etapas 2 (3.4c-4): crane as a service. The fiskaras
-- (crane truck) can also unload/lift to a height — an extra
-- service + time. Capture it on the delivery task: it forces
-- a crane-capable vehicle (the greedy suggestion already
-- filters on requires_crane → has_crane), adds to the trip
-- time, and marks a billable line (invoicing is E3).
-- =====================================================

alter table delivery_tasks
  add column if not exists crane_lift_height_m numeric,
  add column if not exists est_crane_minutes integer,
  add column if not exists crane_billable boolean not null default false;

create or replace function public.set_delivery_crane(args jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_task uuid := (args->>'task_id')::uuid;
  target_org uuid;
  v_needed boolean := coalesce((args->>'requires_crane')::boolean, false);
begin
  select org_id into target_org from delivery_tasks where id = v_task;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  update delivery_tasks set
    requires_crane = v_needed,
    crane_lift_height_m = case when v_needed
      then nullif(replace(args->>'lift_height_m', ',', '.'), '')::numeric else null end,
    est_crane_minutes = case when v_needed
      then nullif(args->>'est_minutes', '')::integer else null end,
    crane_billable = v_needed and coalesce((args->>'billable')::boolean, false)
  where id = v_task;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'delivery_task', v_task, 'user', auth.uid(), 'crane_set',
          jsonb_build_object('requires_crane', v_needed,
                             'minutes', nullif(args->>'est_minutes','')::integer));
end $$;

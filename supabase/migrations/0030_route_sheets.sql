-- =====================================================
-- 0030 — Etapas 2 (3.4c-3): route sequencing for the day.
-- A trip = the tasks assigned to one vehicle on one date;
-- stop_order sequences them so the driver gets an ordered
-- route, and the pick list / trip sheet PDFs render from it.
-- =====================================================

alter table delivery_tasks
  add column if not exists stop_order integer;

create or replace function public.set_stop_order(task_id uuid, p_order integer)
returns void
language plpgsql security definer set search_path = public as $$
declare target_org uuid;
begin
  select org_id into target_org from delivery_tasks where id = task_id;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;
  update delivery_tasks set stop_order = p_order where id = task_id;
end $$;

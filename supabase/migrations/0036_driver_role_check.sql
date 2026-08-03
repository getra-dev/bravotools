-- =====================================================
-- 0036 — pristatymą galima priskirti tik vairuotojui.
-- Savininkas pastebėjo, kad reisuose kaip vairuotojas rodomas
-- objekto vadovas. Priežastis: assign_delivery tikrino tik
-- KVIEČIANTĮJĮ (is_supply), o priskiriamojo vaidmens — ne, o UI
-- siūlė visus org narius. Vartai turi būti DB pusėje, nes sąsaja
-- nėra apsauga.
-- =====================================================

-- Originalus elgesys paliekamas nepaliestas (kranas, vairuotojo
-- nuėmimas priskiriant tuščią reikšmę) — pridedami TIK vartai.
create or replace function public.assign_delivery(args jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_task uuid := (args->>'task_id')::uuid;
  target_org uuid;
  v_driver uuid := nullif(args->>'driver_id', '')::uuid;
  v_vehicle uuid := nullif(args->>'vehicle_id', '')::uuid;
begin
  select org_id into target_org from delivery_tasks where id = v_task;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  -- NAUJA: priskiriamasis privalo būti TOS organizacijos vairuotojas
  if v_driver is not null and not exists (
    select 1 from memberships
    where org_id = target_org and user_id = v_driver and role = 'driver'
  ) then
    raise exception 'not_a_driver';
  end if;

  if v_vehicle is not null and not exists (
    select 1 from vehicles where id = v_vehicle and org_id = target_org) then
    raise exception 'vehicle_not_found';
  end if;

  update delivery_tasks set
    vehicle_id = v_vehicle,
    assigned_to = v_driver,
    scheduled_date = nullif(args->>'scheduled_date', '')::date,
    requires_crane = coalesce((args->>'requires_crane')::boolean, requires_crane)
  where id = v_task;
end $$;

-- Demo duomenų taisymas: reisai buvo priskirti objekto vadovui, todėl
-- vairuotojo ekranas telefone buvo tuščias, o lentoje jis rodėsi kaip
-- vairuotojas. Perrišam prie tikro vairuotojo, jei toks yra.
update delivery_tasks dt
set assigned_to = (
  select m.user_id from memberships m
  where m.org_id = dt.org_id and m.role = 'driver'
  order by m.user_id limit 1)
where dt.assigned_to is not null
  and not exists (
    select 1 from memberships m
    where m.org_id = dt.org_id and m.user_id = dt.assigned_to and m.role = 'driver')
  and exists (
    select 1 from memberships m where m.org_id = dt.org_id and m.role = 'driver');

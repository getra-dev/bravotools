-- =====================================================
-- 0011 — SPEC 2.7: reminder engine (pg_cron daily)
-- rental_due (T-3, T-1, overdue daily), warranty_expiring
-- (T-30), inspection_due (T-14). Recipients: org supply
-- group (owner/admin/supply_manager) + current holder for
-- rentals. De-duped per user/entity/type per day.
-- Push delivery follows after the ADR-014 promotion gate;
-- until then these are in-app notifications (ADR-015 note).
-- =====================================================

create extension if not exists pg_cron;

create or replace function public.remind(
  target_org uuid, target_user uuid, kind text, r_title text, r_body text,
  e_type text, e_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if target_user is null then return; end if;
  -- one reminder per user/entity/kind per day
  if exists (
    select 1 from notifications
    where user_id = target_user and entity_id = e_id and type = kind
      and created_at >= date_trunc('day', now())
  ) then
    return;
  end if;
  insert into notifications (org_id, user_id, type, title, body, entity_type, entity_id)
  values (target_org, target_user, kind, r_title, r_body, e_type, e_id);
end $$;

create or replace function public.run_daily_reminders()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t record;
  s record;
  member record;
  label text;
  created_before integer;
  created_after integer;
begin
  select count(*) into created_before from notifications;

  -- rentals: T-3, T-1 and every day overdue
  for t in
    select id, org_id, name, qr_code, rental_due_return, current_holder_id
    from tools
    where ownership = 'rented'
      and status not in ('returned_to_vendor', 'written_off')
      and rental_due_return is not null
      and (rental_due_return - current_date) in (3, 1)
       or (ownership = 'rented'
           and status not in ('returned_to_vendor', 'written_off')
           and rental_due_return is not null
           and rental_due_return < current_date)
  loop
    label := coalesce(t.qr_code, t.name);
    if t.rental_due_return < current_date then
      perform remind(t.org_id, t.current_holder_id, 'rental_due',
        'Rental OVERDUE: ' || label,
        t.name || ' should have been returned on ' || t.rental_due_return,
        'tool', t.id);
      for member in select user_id from memberships
                    where org_id = t.org_id and role in ('owner','admin','supply_manager')
      loop
        perform remind(t.org_id, member.user_id, 'rental_due',
          'Rental OVERDUE: ' || label,
          t.name || ' should have been returned on ' || t.rental_due_return,
          'tool', t.id);
      end loop;
    else
      perform remind(t.org_id, t.current_holder_id, 'rental_due',
        'Rental due ' || t.rental_due_return || ': ' || label,
        t.name || ' must be returned by ' || t.rental_due_return,
        'tool', t.id);
      for member in select user_id from memberships
                    where org_id = t.org_id and role in ('owner','admin','supply_manager')
      loop
        perform remind(t.org_id, member.user_id, 'rental_due',
          'Rental due ' || t.rental_due_return || ': ' || label,
          t.name || ' must be returned by ' || t.rental_due_return,
          'tool', t.id);
      end loop;
    end if;
  end loop;

  -- warranty: T-30 exact day
  for t in
    select id, org_id, name, qr_code, warranty_until
    from tools
    where warranty_until is not null
      and status not in ('written_off', 'returned_to_vendor')
      and (warranty_until - current_date) = 30
  loop
    label := coalesce(t.qr_code, t.name);
    for member in select user_id from memberships
                  where org_id = t.org_id and role in ('owner','admin','supply_manager')
    loop
      perform remind(t.org_id, member.user_id, 'warranty_expiring',
        'Warranty ends ' || t.warranty_until || ': ' || label,
        t.name || ' warranty expires in 30 days',
        'tool', t.id);
    end loop;
  end loop;

  -- inspections: T-14 exact day
  for s in
    select i.id, i.org_id, i.tool_id, i.inspection_type, i.next_due,
           tl.name as tool_name, tl.qr_code
    from inspection_schedules i
    join tools tl on tl.id = i.tool_id
    where i.next_due is not null
      and (i.next_due - current_date) = 14
  loop
    label := coalesce(s.qr_code, s.tool_name);
    for member in select user_id from memberships
                  where org_id = s.org_id and role in ('owner','admin','supply_manager')
    loop
      perform remind(s.org_id, member.user_id, 'inspection_due',
        'Inspection due ' || s.next_due || ': ' || label,
        s.tool_name || ' — ' || s.inspection_type || ' due ' || s.next_due,
        'tool', s.tool_id);
    end loop;
  end loop;

  select count(*) into created_after from notifications;
  return jsonb_build_object('created', created_after - created_before);
end $$;

-- users mark their own notifications read
create policy notifications_own_update on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- daily at 06:00 UTC (09:00 Vilnius vasarą 08:00 žiemą — org TZ vėliau)
select cron.schedule('bravotools-daily-reminders', '0 6 * * *',
                     $$select public.run_daily_reminders()$$);

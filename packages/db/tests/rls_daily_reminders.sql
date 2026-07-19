-- Test: SPEC 2.7 reminder engine (migration 0011).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('efefefef-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'boss@t27.local', now(), now()),
  ('efefefef-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'holder@t27.local', now(), now());

insert into organizations (id, name) values
  ('efefefef-1111-0000-0000-000000000001', 'T27 Reminders Org');
insert into memberships (org_id, user_id, role) values
  ('efefefef-1111-0000-0000-000000000001', 'efefefef-0000-0000-0000-00000000000a', 'supply_manager'),
  ('efefefef-1111-0000-0000-000000000001', 'efefefef-0000-0000-0000-00000000000b', 'worker');

insert into tools (id, org_id, name, qr_code, ownership, status, rental_due_return, current_holder_id) values
  -- overdue rental held by worker
  ('efefefef-2222-0000-0000-000000000001', 'efefefef-1111-0000-0000-000000000001',
   'T27 Rented drill', 'T27-QR-1', 'rented', 'checked_out',
   (current_date - 2), 'efefefef-0000-0000-0000-00000000000b'),
  -- rental due in 3 days, no holder
  ('efefefef-2222-0000-0000-000000000002', 'efefefef-1111-0000-0000-000000000001',
   'T27 Rented lift', 'T27-QR-2', 'rented', 'available', (current_date + 3), null);

-- warranty exactly T-30
insert into tools (id, org_id, name, qr_code, status, purchase_date, warranty_months) values
  ('efefefef-2222-0000-0000-000000000003', 'efefefef-1111-0000-0000-000000000001',
   'T27 Warranty saw', 'T27-QR-3', 'available',
   (current_date + 30 - interval '24 months')::date, 24);

-- inspection exactly T-14
insert into inspection_schedules (org_id, tool_id, inspection_type, interval_months, next_due) values
  ('efefefef-1111-0000-0000-000000000001', 'efefefef-2222-0000-0000-000000000003',
   'electrical_safety', 12, (current_date + 14));

do $$
declare res jsonb; n integer;
begin
  select run_daily_reminders() into res;
  if (res->>'created')::integer < 4 then
    raise exception 'FAIL: expected >=4 reminders, created %', res->>'created';
  end if;

  -- holder got the overdue reminder
  select count(*) into n from notifications
  where user_id = 'efefefef-0000-0000-0000-00000000000b'
    and type = 'rental_due' and title like 'Rental OVERDUE%';
  if n <> 1 then raise exception 'FAIL: holder overdue reminder missing (%)', n; end if;

  -- supply manager got overdue + due-in-3 + warranty + inspection
  select count(*) into n from notifications
  where user_id = 'efefefef-0000-0000-0000-00000000000a';
  if n <> 4 then raise exception 'FAIL: supply manager expected 4 reminders, got %', n; end if;

  -- second run same day: nothing new
  select run_daily_reminders() into res;
  if (res->>'created')::integer <> 0 then
    raise exception 'FAIL: dedupe broken — second run created %', res->>'created';
  end if;
end $$;

-- worker can mark own notification read, not others'
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"efefefef-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare n integer;
begin
  update notifications set read_at = now()
  where user_id = 'efefefef-0000-0000-0000-00000000000b';
  select count(*) into n from notifications
  where user_id = 'efefefef-0000-0000-0000-00000000000b' and read_at is null;
  if n <> 0 then raise exception 'FAIL: could not mark own notifications read'; end if;

  update notifications set read_at = now()
  where user_id = 'efefefef-0000-0000-0000-00000000000a';
  -- RLS: update on others' rows silently affects 0 rows
end $$;

reset role;
do $$
declare n integer;
begin
  select count(*) into n from notifications
  where user_id = 'efefefef-0000-0000-0000-00000000000a' and read_at is not null;
  if n <> 0 then raise exception 'FAIL: worker marked someone else notifications read'; end if;
end $$;

rollback;

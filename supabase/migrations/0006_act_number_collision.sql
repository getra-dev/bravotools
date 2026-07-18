-- =====================================================
-- 0006 — act numbering: walk past existing act numbers
-- (found on device: seeded acts BT-AKT-2026-0001/0002 exist
-- without a settings counter → next_act_number collided, 409)
-- =====================================================

create or replace function public.next_act_number(target_org uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  counter integer;
  act_year text;
  this_year text := to_char(now(), 'YYYY');
  prefix text;
  candidate text;
  attempts integer := 0;
begin
  select coalesce(settings#>>'{numbering,act,year}', ''),
         coalesce((settings#>>'{numbering,act,counter}')::integer, 0),
         coalesce(settings#>>'{numbering,act,prefix}', 'BT-AKT-')
    into act_year, counter, prefix
  from organizations where id = target_org for update;

  if act_year <> this_year then
    counter := 0;
  end if;

  loop
    counter := counter + 1;
    attempts := attempts + 1;
    if attempts > 10000 then
      raise exception 'act_sequence_exhausted';
    end if;
    candidate := prefix || this_year || '-' || lpad(counter::text, 4, '0');
    exit when not exists (
      select 1 from handover_acts
      where org_id = target_org and act_number = candidate
    );
  end loop;

  update organizations
  set settings = jsonb_set(
        jsonb_set(coalesce(settings, '{}'::jsonb), '{numbering}',
                  coalesce(settings->'numbering', '{}'::jsonb), true),
        '{numbering,act}',
        jsonb_build_object('prefix', prefix, 'year', this_year, 'counter', counter), true)
  where id = target_org;

  return candidate;
end $$;

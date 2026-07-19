-- =====================================================
-- 0017 — OWNER AMENDMENT (SPEC 3.1 structured lines):
-- request items carry worker-entered qty + unit so the
-- order→delivery→invoice reconciliation chain starts
-- structured at the source. Dispatcher can still override
-- at confirm time (confirm_material_match coalesces).
-- =====================================================

create or replace function public.create_material_request(args jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_site uuid := (args->>'site_id')::uuid;
  v_needed date := nullif(args->>'needed_by', '')::date;
  v_hot boolean := coalesce((args->>'is_hot')::boolean, false);
  v_reason text := nullif(args->>'hot_reason', '');
  target_org uuid;
  new_id uuid;
  item jsonb;
  item_count integer := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select org_id into target_org from locations where id = v_site;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_org_member(target_org) then raise exception 'not_allowed'; end if;
  if not (is_supply(target_org) or is_assigned_to_site(v_site)) then
    raise exception 'not_assigned';
  end if;
  if v_hot and v_reason is null then raise exception 'hot_reason_required'; end if;

  insert into material_requests (org_id, site_id, requested_by, needed_by, is_hot, hot_reason)
  values (target_org, v_site, auth.uid(), v_needed, v_hot,
          case when v_hot then v_reason else null end)
  returning id into new_id;

  for item in select * from jsonb_array_elements(coalesce(args->'items', '[]'::jsonb)) loop
    if nullif(trim(item->>'raw_text'), '') is not null then
      insert into material_request_items (request_id, raw_text, qty, unit)
      values (new_id,
              trim(item->>'raw_text'),
              nullif(replace(item->>'qty', ',', '.'), '')::numeric,
              nullif(trim(coalesce(item->>'unit', '')), ''));
      item_count := item_count + 1;
    end if;
  end loop;
  if item_count = 0 then raise exception 'items_required'; end if;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'material_request', new_id, 'user', auth.uid(), 'created',
          jsonb_build_object('site_id', v_site, 'items', item_count, 'is_hot', v_hot));
  return new_id;
end $$;

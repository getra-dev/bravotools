-- =====================================================
-- 0018 — Etapas 2C (SPEC 3.5 be AI): receiving on site.
-- Foreman confirms a delivery exception-first: lines
-- default to fully received, shortages become
-- delivery_issues (photo evidence) and supply gets
-- notified. delivered_quantity accumulates across
-- partial deliveries; order status follows the numbers.
-- =====================================================

-- read access mirrors orders (0016): supply sees all, site people their own
create policy delivery_issues_select on delivery_issues
  for select using (
    is_supply(org_id)
    or exists (
      select 1 from order_items i
      join orders o on o.id = i.order_id
      where i.id = delivery_issues.order_item_id
        and is_assigned_to_site(o.site_id)
    )
  );

create or replace function public.receive_order(args jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid := (args->>'order_id')::uuid;
  ord record;
  line jsonb;
  item record;
  v_received numeric;
  v_issue text;
  issue_count integer := 0;
  line_count integer := 0;
  remaining_total numeric;
  new_status text;
  supply_user record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into ord from orders where id = v_order;
  if ord.id is null then raise exception 'not_found'; end if;
  if not (is_supply(ord.org_id) or is_assigned_to_site(ord.site_id)) then
    raise exception 'not_allowed';
  end if;
  if ord.status in ('delivered', 'cancelled') then
    raise exception 'order_closed';
  end if;

  for line in select * from jsonb_array_elements(coalesce(args->'lines', '[]'::jsonb)) loop
    select * into item from order_items
    where id = (line->>'item_id')::uuid and order_id = v_order;
    if item.id is null then raise exception 'item_not_found'; end if;

    v_received := coalesce(nullif(replace(line->>'received_qty', ',', '.'), '')::numeric, 0);
    if v_received < 0 then raise exception 'invalid_qty'; end if;

    update order_items
    set delivered_quantity = coalesce(delivered_quantity, 0) + v_received
    where id = item.id;
    line_count := line_count + 1;

    v_issue := nullif(line->>'issue_type', '');
    if v_issue is not null then
      insert into delivery_issues
        (org_id, order_item_id, issue_type, qty_affected, description,
         photo_path, reported_by, status)
      values
        (ord.org_id, item.id, v_issue,
         nullif(replace(line->>'issue_qty', ',', '.'), '')::numeric,
         nullif(trim(coalesce(line->>'issue_note', '')), ''),
         nullif(trim(coalesce(line->>'photo_path', '')), ''),
         auth.uid(), 'open');
      issue_count := issue_count + 1;
    end if;
  end loop;
  if line_count = 0 then raise exception 'lines_required'; end if;

  select coalesce(sum(greatest(quantity - coalesce(delivered_quantity, 0), 0)), 0)
    into remaining_total
  from order_items where order_id = v_order;
  new_status := case when remaining_total = 0 then 'delivered'
                     else 'partially_delivered' end;
  update orders set status = new_status where id = v_order;

  -- SPEC 2.7 pattern: supply side hears about every shortage
  if issue_count > 0 then
    for supply_user in
      select user_id from memberships
      where org_id = ord.org_id and role in ('owner', 'admin', 'supply_manager')
    loop
      insert into notifications (org_id, user_id, type, title, body, entity_type, entity_id)
      values (ord.org_id, supply_user.user_id, 'delivery_issue',
              ord.order_number, format('%s issue(s) reported on receiving', issue_count),
              'order', v_order);
    end loop;
  end if;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (ord.org_id, 'order', v_order, 'user', auth.uid(), 'received',
          jsonb_build_object('lines', line_count, 'issues', issue_count,
                             'status', new_status));
  return jsonb_build_object('status', new_status, 'issues', issue_count);
end $$;

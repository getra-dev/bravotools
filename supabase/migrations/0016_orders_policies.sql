-- =====================================================
-- 0016 — orders visibility per roles matrix §1 (gap since
-- 0001: RLS enabled but no policies — web counts showed 0).
-- Supply side sees all org orders; workers/site managers
-- see orders for their own sites.
-- =====================================================

create policy orders_select on orders
  for select using (is_supply(org_id) or is_assigned_to_site(site_id));

create policy order_items_select on order_items
  for select using (exists (
    select 1 from orders o where o.id = order_items.order_id
  ));

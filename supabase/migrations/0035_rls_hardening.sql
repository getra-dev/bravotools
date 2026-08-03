-- =====================================================
-- 0035 — RLS sutvirtinimas. Auditas (2026-08-03) rado, kad
-- keturios vietos leidžia darbininkui daryti tai, ko SPEC §1
-- neleidžia, o 16 lentelių turi įjungtą RLS BE politikų —
-- t. y. jos grąžina nulį net savininkui.
--
-- Principas: skaitymas — pagal SPEC §1 matricą; rašymas į
-- lenteles neleidžiamas niekam (rašo tik SECURITY DEFINER
-- RPC'ai, kurie patys tikrina vaidmenį). Taip apeiti vartus
-- per PostgREST nebeįmanoma.
-- =====================================================

-- ---------- 1. add_line_to_order: nebuvo JOKIO patikrinimo ----------
-- Bet kuris prisijungęs vartotojas galėjo įrašyti kainuojančią
-- eilutę į bet kurį užsakymą, net svetimos organizacijos.
create or replace function public.add_line_to_order(
  p_order uuid, p_vendor uuid, p_item_id uuid, p_material_id uuid,
  p_raw_text text, p_qty numeric, p_unit text,
  p_canonical text, p_base_unit text, p_vendor_lead integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_price numeric;
  v_lead integer;
  target_org uuid;
begin
  select org_id into target_org from orders where id = p_order;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  -- svetimos organizacijos medžiaga ar tiekėjas į eilutę nepatenka
  if p_material_id is not null and not exists (
    select 1 from materials where id = p_material_id and org_id = target_org) then
    raise exception 'material_not_found';
  end if;
  if p_vendor is not null and not exists (
    select 1 from vendors where id = p_vendor and org_id = target_org) then
    raise exception 'vendor_not_found';
  end if;
  if p_item_id is not null and not exists (
    select 1 from material_request_items mri
    join material_requests mr on mr.id = mri.request_id
    where mri.id = p_item_id and mr.org_id = target_org) then
    raise exception 'request_item_not_found';
  end if;

  if p_vendor is not null and p_material_id is not null then
    select price, lead_time_days into v_price, v_lead from vendor_catalog_items
    where vendor_id = p_vendor and material_id = p_material_id;
  end if;
  v_lead := coalesce(v_lead, p_vendor_lead);

  insert into order_items (order_id, material_id, description, quantity, unit,
                           unit_price, expected_date)
  values (p_order, p_material_id,
          coalesce(p_canonical, p_raw_text),
          coalesce(p_qty, 1),
          coalesce(p_unit, p_base_unit, 'vnt'),
          v_price,
          case when v_lead is not null then current_date + v_lead else null end);
  update material_request_items set status = 'ordered' where id = p_item_id;
end $$;

-- ---------- 2. mark_delivery: bet kas galėjo suklastoti pristatymo įrodymą ----------
-- SPEC §1: vairuotojas — „own assigned + own trips". Dabar:
-- arba tiekimas, arba tas, kuriam užduotis priskirta.
create or replace function public.mark_delivery(args jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_task uuid := (args->>'task_id')::uuid;
  v_status text := args->>'status';
  task record;
begin
  select * into task from delivery_tasks where id = v_task;
  if task.id is null then raise exception 'not_found'; end if;
  -- coalesce būtinas: kai assigned_to yra NULL, palyginimas duoda NULL,
  -- o `not (false or NULL)` nėra true — vartai tyliai neužsidarytų.
  if not (is_supply(task.org_id) or coalesce(task.assigned_to = auth.uid(), false)) then
    raise exception 'not_allowed';
  end if;
  if v_status not in ('picked_up', 'delivered') then raise exception 'invalid_status'; end if;

  update delivery_tasks set
    status = v_status,
    picked_up_at = case when v_status = 'picked_up' then now() else picked_up_at end,
    delivered_at = case when v_status = 'delivered' then now() else delivered_at end,
    pickup_document_path = coalesce(nullif(args->>'photo_path', ''), pickup_document_path)
  where id = v_task;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (task.org_id, 'delivery_task', v_task, 'user', auth.uid(), v_status,
          jsonb_build_object('photo', args->>'photo_path'));
end $$;

-- ---------- 3. tools: pamiršta „pavyzdinė" FOR ALL politika ----------
-- Ji leido darbininkui keisti ir trinti įrankius tiesiai per API,
-- apeinant assert_tool_editor() RPC'uose. Skaitymas lieka visiems
-- org nariams (SPEC §1: „Tools list — all org"), rašymas — tik per RPC.
drop policy if exists org_members_all on tools;
drop policy if exists tools_org_select on tools;
create policy tools_org_select on tools
  for select using (is_org_member(org_id));

-- ---------- 4. activity_log: pinigų duomenys sunkėsi per auditą ----------
-- Žurnale guli užsakymų sumos ir permokų sutikrinimai, o politika
-- buvo is_org_member. SPEC §1: worker/site_manager — tik savo įrašai.
-- DĖMESIO: politikos sumuojasi per ARBA. Senoji privalo dingti,
-- kitaip naujoji nieko neriboja. Tikrasis jos vardas — activity_org_select.
drop policy if exists activity_org_select on activity_log;
drop policy if exists activity_log_scoped_select on activity_log;
create policy activity_log_scoped_select on activity_log
  for select using (
    is_supply(org_id)
    or actor_id = auth.uid()
  );

-- ---------- 5. Kainų istorija — tiekimo lygis ----------
drop policy if exists material_price_points_org_select on material_price_points;
drop policy if exists material_price_points_supply_select on material_price_points;
create policy material_price_points_supply_select on material_price_points
  for select using (is_supply(org_id));

drop policy if exists vendor_catalog_org_select on vendor_catalog_items;
drop policy if exists vendor_catalog_supply_select on vendor_catalog_items;
create policy vendor_catalog_supply_select on vendor_catalog_items
  for select using (is_supply(org_id));

-- ---------- 6. Šešiolika lentelių su RLS BE politikų ----------
-- Šitos grąžindavo nulį VISIEMS, įskaitant savininką: tiekėjų
-- sąskaitos, perrašymo sąskaitos, rezervacijos realiai neveikė.

-- Pinigų sluoksnis (SPEC §1: „Costs, invoices, reconciliation" — tik tiekimas)
drop policy if exists vendor_invoices_supply_select on vendor_invoices;
create policy vendor_invoices_supply_select on vendor_invoices
  for select using (is_supply(org_id));
drop policy if exists vendor_invoice_lines_supply_select on vendor_invoice_lines;
create policy vendor_invoice_lines_supply_select on vendor_invoice_lines
  for select using (exists (
    select 1 from vendor_invoices vi
    where vi.id = vendor_invoice_lines.invoice_id and is_supply(vi.org_id)));

drop policy if exists internal_invoices_supply_select on internal_invoices;
create policy internal_invoices_supply_select on internal_invoices
  for select using (is_supply(org_id));
drop policy if exists internal_invoice_lines_supply_select on internal_invoice_lines;
create policy internal_invoice_lines_supply_select on internal_invoice_lines
  for select using (exists (
    select 1 from internal_invoices ii
    where ii.id = internal_invoice_lines.invoice_id and is_supply(ii.org_id)));

drop policy if exists recharge_invoices_supply_select on recharge_invoices;
create policy recharge_invoices_supply_select on recharge_invoices
  for select using (is_supply(org_id));
drop policy if exists recharge_invoice_lines_supply_select on recharge_invoice_lines;
create policy recharge_invoice_lines_supply_select on recharge_invoice_lines
  for select using (exists (
    select 1 from recharge_invoices ri
    where ri.id = recharge_invoice_lines.invoice_id and is_supply(ri.org_id)));

-- Pirkimų derybos (kainos tiekėjų pasiūlymuose) — tiekimas
drop policy if exists quote_requests_supply_select on quote_requests;
create policy quote_requests_supply_select on quote_requests
  for select using (is_supply(org_id));
drop policy if exists quotes_supply_select on quotes;
create policy quotes_supply_select on quotes
  for select using (exists (
    select 1 from quote_requests qr
    where qr.id = quotes.quote_request_id and is_supply(qr.org_id)));

-- Objekto lygio duomenys (SPEC §1: „Site services, waste" — savi objektai)
drop policy if exists site_services_scoped_select on site_services;
create policy site_services_scoped_select on site_services
  for select using (is_supply(org_id) or is_assigned_to_site(site_id));
drop policy if exists waste_containers_scoped_select on waste_containers;
create policy waste_containers_scoped_select on waste_containers
  for select using (is_supply(org_id) or is_assigned_to_site(site_id));
drop policy if exists waste_records_scoped_select on waste_records;
create policy waste_records_scoped_select on waste_records
  for select using (is_supply(org_id) or is_assigned_to_site(site_id));
drop policy if exists resource_reservations_scoped_select on resource_reservations;
create policy resource_reservations_scoped_select on resource_reservations
  for select using (is_supply(org_id) or is_assigned_to_site(site_id));

-- Kuro sąnaudos: tiekimas mato viską, vairuotojas — savo
drop policy if exists fuel_logs_scoped_select on fuel_logs;
create policy fuel_logs_scoped_select on fuel_logs
  for select using (is_supply(org_id) or driver_id = auth.uid());

-- Paminėjimai: mato paminėtasis arba tas, kas mato patį komentarą
drop policy if exists comment_mentions_select on comment_mentions;
create policy comment_mentions_select on comment_mentions
  for select using (
    mentioned_user_id = auth.uid()
    or exists (select 1 from comments c where c.id = comment_mentions.comment_id)
  );

-- admin_access_log ir platform_admins SĄMONINGAI lieka be politikų:
-- tai platformos (ne kliento) lentelės, pasiekiamos tik service role.

-- ---------- 6b. Pristatymai ir dėmesio eilė ----------
-- SPEC §1: delivery_tasks — vairuotojui „own assigned + own trips",
-- darbininkui/objekto vadovui — savo objekto. Buvo: visi mato viską.
drop policy if exists delivery_tasks_org_select on delivery_tasks;
drop policy if exists delivery_tasks_scoped_select on delivery_tasks;
create policy delivery_tasks_scoped_select on delivery_tasks
  for select using (
    is_supply(org_id)
    or assigned_to = auth.uid()
    or is_assigned_to_site(dropoff_location_id)
    or is_assigned_to_site(pickup_location_id)
  );

-- Dėmesio eilė ir AI žurnalas (0034) — tiekimo įrankiai. Kortelėse
-- guli svetimų objektų užsakymai ir tiekėjų vardai.
drop policy if exists attention_cards_org_select on attention_cards;
drop policy if exists attention_cards_supply_select on attention_cards;
create policy attention_cards_supply_select on attention_cards
  for select using (is_supply(org_id));

drop policy if exists ai_runs_org_select on ai_runs;
drop policy if exists ai_runs_supply_select on ai_runs;
create policy ai_runs_supply_select on ai_runs
  for select using (is_supply(org_id));

-- ---------- 7. Pranešimų klastojimas ----------
-- remind() ir notify_missing_components() priima target_org /
-- target_user kaip argumentus be jokio patikrinimo, tad per
-- PostgREST bet kas galėjo įmesti „sisteminį" pranešimą bet kam
-- (pvz. suklastotą „laukia tavo parašo").
--
-- Vaidmens patikrinimo į jas dėti NEGALIMA: remind() kviečia
-- naktinis run_daily_reminders(), kuris sukasi be vartotojo —
-- is_supply() ten būtų false ir priminimai tyliai nustotų veikę.
-- Abi funkcijos yra VIDINĖS (kviečiamos tik iš kitų SECURITY
-- DEFINER funkcijų), tad teisingas sprendimas — pašalinti jas
-- iš API paviršiaus. Vidiniai kvietimai veikia toliau, nes
-- vykdomi savininko teisėmis.
revoke execute on function public.remind(uuid, uuid, text, text, text, text, uuid)
  from authenticated, anon;
revoke execute on function public.notify_missing_components(uuid, uuid, uuid)
  from authenticated, anon;

-- run_daily_reminders() irgi neturi būti kviečiamas iš kliento —
-- tai cron/service role darbas.
revoke execute on function public.run_daily_reminders() from authenticated, anon;

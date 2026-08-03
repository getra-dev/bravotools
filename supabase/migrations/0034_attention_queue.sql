-- =====================================================
-- 0034 — Etapas 2 (SPEC 3.3): dėmesio eilė + AI iškvietimų
-- žurnalas. Faktus renka SQL (collect_attention_signals) —
-- AI tik reitinguoja, paaiškina priežastį ir siūlo veiksmus
-- iš FIKSUOTO katalogo. Modelis niekada negamina nuorodų ar
-- šoninių efektų: veiksmą vykdo žmogus esamais srautais.
-- =====================================================

-- ---------- AI iškvietimų įrodymų žurnalas ----------
create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  endpoint text not null,                  -- 'attention-queue', 'invoice-parse', ...
  model text not null,
  status text not null default 'ok' check (status in ('ok', 'error')),
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  error text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table ai_runs enable row level security;
create index if not exists ai_runs_org_idx on ai_runs (org_id, created_at desc);

create policy ai_runs_org_select on ai_runs
  for select using (is_org_member(org_id));

-- ---------- dėmesio kortelės ----------
create table if not exists attention_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  run_id uuid references ai_runs(id) on delete set null,
  signal_key text not null,                -- vendor_silent, eta_overdue, ...
  entity_type text not null,               -- order, order_item, request, issue
  entity_id uuid not null,
  rank integer not null default 100,       -- 1 = svarbiausia
  severity text not null default 'warning' check (severity in ('critical', 'warning', 'info')),
  reason text not null,                    -- viena eilutė: KODĖL tai čia
  actions jsonb not null default '[]',     -- [{key, entity_id}] iš fiksuoto katalogo
  facts jsonb not null default '{}',       -- SQL surinkti faktai (audituojama)
  status text not null default 'open' check (status in ('open', 'dismissed')),
  dismissed_by uuid references profiles(id),
  dismissed_at timestamptz,
  dismiss_reason text,
  created_at timestamptz not null default now()
);

alter table attention_cards enable row level security;
create index if not exists attention_cards_open_idx
  on attention_cards (org_id, status, rank) where status = 'open';

create policy attention_cards_org_select on attention_cards
  for select using (is_org_member(org_id));

-- ---------- faktų rinkimas (be AI) ----------
-- Grąžina jsonb masyvą išimčių. Tai VIENINTELIS tiesos šaltinis:
-- modeliui siunčiama tik tai, ką grąžino ši funkcija.
create or replace function public.collect_attention_signals(target_org uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  with
  -- 1) tiekėjas tyli: PO išsiųstas > 24 val., nieko nepristatyta
  vendor_silent as (
    select jsonb_build_object(
      'signal_key', 'vendor_silent',
      'entity_type', 'order',
      'entity_id', o.id,
      'facts', jsonb_build_object(
        'order_number', o.order_number,
        'vendor', v.name,
        'vendor_id', v.id,
        'is_hot', o.is_hot,
        'needed_by', o.needed_by,
        'sent_at', max(om.status_updated_at),
        'hours_silent', round(extract(epoch from (now() - max(om.status_updated_at))) / 3600))
    ) as card
    from orders o
    join outbound_messages om
      on om.entity_type = 'order' and om.entity_id = o.id and om.status = 'sent'
    left join vendors v on v.id = o.vendor_id
    where o.org_id = target_org
      and o.status = 'ordered'
      and not exists (
        select 1 from order_items oi where oi.order_id = o.id and oi.delivered_quantity > 0)
    group by o.id, o.order_number, o.is_hot, o.needed_by, v.name, v.id
    having max(om.status_updated_at) < now() - interval '24 hours'
  ),
  -- 2) ETA praėjo, o eilutė vis dar neatvežta
  eta_overdue as (
    select jsonb_build_object(
      'signal_key', 'eta_overdue',
      'entity_type', 'order_item',
      'entity_id', oi.id,
      'facts', jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'description', oi.description,
        'vendor', v.name,
        'expected_date', oi.expected_date,
        'days_late', (current_date - oi.expected_date),
        'outstanding_qty', oi.quantity - oi.delivered_quantity,
        'unit', oi.unit,
        'is_hot', o.is_hot)
    ) as card
    from order_items oi
    join orders o on o.id = oi.order_id
    left join vendors v on v.id = o.vendor_id
    where o.org_id = target_org
      and o.status not in ('delivered', 'cancelled')
      and oi.expected_date is not null
      and oi.expected_date < current_date
      and oi.delivered_quantity < oi.quantity
  ),
  -- 3) atviri priėmimo trūkumai (trūksta kiekio, brokas, ne tas daiktas)
  open_issue as (
    select jsonb_build_object(
      'signal_key', 'open_issue',
      'entity_type', 'issue',
      'entity_id', di.id,
      'facts', jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'order_item_id', oi.id,
        'description', oi.description,
        'issue_type', di.issue_type,
        'qty_affected', di.qty_affected,
        'vendor', v.name,
        'reported_at', di.created_at)
    ) as card
    from delivery_issues di
    join order_items oi on oi.id = di.order_item_id
    join orders o on o.id = oi.order_id
    left join vendors v on v.id = o.vendor_id
    where di.org_id = target_org
      and di.status not in ('resolved', 'written_off')
  ),
  -- 4) HOT poreikis vis dar neapdorotas
  hot_request as (
    select jsonb_build_object(
      'signal_key', 'hot_request_open',
      'entity_type', 'request',
      'entity_id', mr.id,
      'facts', jsonb_build_object(
        'site', l.name,
        'needed_by', mr.needed_by,
        'hot_reason', mr.hot_reason,
        'hours_open', round(extract(epoch from (now() - mr.created_at)) / 3600),
        'lines', (select count(*) from material_request_items mri where mri.request_id = mr.id))
    ) as card
    from material_requests mr
    join locations l on l.id = mr.site_id
    where mr.org_id = target_org and mr.is_hot and mr.status = 'open'
  ),
  -- 5) paprastas poreikis kabo > 48 val.
  stale_request as (
    select jsonb_build_object(
      'signal_key', 'stale_request',
      'entity_type', 'request',
      'entity_id', mr.id,
      'facts', jsonb_build_object(
        'site', l.name,
        'needed_by', mr.needed_by,
        'hours_open', round(extract(epoch from (now() - mr.created_at)) / 3600),
        'lines', (select count(*) from material_request_items mri where mri.request_id = mr.id))
    ) as card
    from material_requests mr
    join locations l on l.id = mr.site_id
    where mr.org_id = target_org and not mr.is_hot and mr.status = 'open'
      and mr.created_at < now() - interval '48 hours'
  ),
  -- 6) užsakymas patvirtintas, bet tiekėjui taip ir neišsiųstas
  unsent_order as (
    select jsonb_build_object(
      'signal_key', 'unsent_order',
      'entity_type', 'order',
      'entity_id', o.id,
      'facts', jsonb_build_object(
        'order_number', o.order_number,
        'vendor', v.name,
        'vendor_id', v.id,
        'is_hot', o.is_hot,
        'needed_by', o.needed_by,
        'days_waiting', (current_date - o.created_at::date),
        'has_vendor_email', (v.email is not null))
    ) as card
    from orders o
    left join vendors v on v.id = o.vendor_id
    where o.org_id = target_org
      and o.status in ('requested', 'approved')
      and not exists (
        select 1 from outbound_messages om
        where om.entity_type = 'order' and om.entity_id = o.id and om.status = 'sent')
      and o.created_at < now() - interval '4 hours'
  ),
  -- 7) galimas dublikatas: ta pati medžiaga tam pačiam objektui per 7 d.
  duplicate_request as (
    select jsonb_build_object(
      'signal_key', 'possible_duplicate',
      'entity_type', 'request',
      'entity_id', mr.id,
      'facts', jsonb_build_object(
        'site', l.name,
        'material', m.canonical_name,
        'other_request_id', other.request_id,
        'other_created_at', other.created_at)
    ) as card
    from material_request_items mri
    join material_requests mr on mr.id = mri.request_id
    join locations l on l.id = mr.site_id
    join materials m on m.id = mri.material_id
    join lateral (
      select mr2.id as request_id, mr2.created_at
      from material_request_items mri2
      join material_requests mr2 on mr2.id = mri2.request_id
      where mri2.material_id = mri.material_id
        and mr2.site_id = mr.site_id
        and mr2.id <> mr.id
        and mr2.status in ('open', 'processing')
        and mr2.created_at between mr.created_at - interval '7 days'
                               and mr.created_at + interval '7 days'
      limit 1
    ) other on true
    where mr.org_id = target_org
      and mr.status = 'open'
      and mri.material_id is not null
  )
  select coalesce(jsonb_agg(card), '[]'::jsonb) into result
  from (
    select card from vendor_silent
    union all select card from eta_overdue
    union all select card from open_issue
    union all select card from hot_request
    union all select card from stale_request
    union all select card from unsent_order
    union all select card from duplicate_request
  ) all_signals;

  return result;
end $$;

-- ---------- AI rezultato įrašymas ----------
-- Atominis: naujas run + kortelių pakeitimas. Atmestos kortelės
-- (status='dismissed') NEatkuriamos — žmogaus sprendimas viršesnis.
create or replace function public.save_attention_cards(args jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  target_org uuid := (args->>'org_id')::uuid;
  v_run uuid;
  card jsonb;
  v_count integer := 0;
begin
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  insert into ai_runs (org_id, endpoint, model, status, input_tokens, output_tokens,
                       latency_ms, error, created_by)
  values (target_org, coalesce(args->>'endpoint', 'attention-queue'), args->>'model',
          coalesce(args->>'status', 'ok'),
          nullif(args->>'input_tokens', '')::integer,
          nullif(args->>'output_tokens', '')::integer,
          nullif(args->>'latency_ms', '')::integer,
          nullif(args->>'error', ''), auth.uid())
  returning id into v_run;

  -- senos atviros kortelės pakeičiamos naujausiu vaizdu
  delete from attention_cards where org_id = target_org and status = 'open';

  for card in select * from jsonb_array_elements(coalesce(args->'cards', '[]'::jsonb))
  loop
    -- žmogaus atmestos kortelės nebegrįžta
    if exists (
      select 1 from attention_cards
      where org_id = target_org and status = 'dismissed'
        and entity_id = (card->>'entity_id')::uuid
        and signal_key = card->>'signal_key'
    ) then
      continue;
    end if;

    insert into attention_cards (org_id, run_id, signal_key, entity_type, entity_id,
                                 rank, severity, reason, actions, facts)
    values (target_org, v_run, card->>'signal_key', card->>'entity_type',
            (card->>'entity_id')::uuid,
            coalesce((card->>'rank')::integer, 100),
            coalesce(nullif(card->>'severity', ''), 'warning'),
            coalesce(card->>'reason', ''),
            coalesce(card->'actions', '[]'::jsonb),
            coalesce(card->'facts', '{}'::jsonb));
    v_count := v_count + 1;
  end loop;

  -- AI veiksmas → activity_log su actor_type='ai' (CLAUDE.md 9 taisyklė)
  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'ai_run', v_run, 'ai', auth.uid(), 'attention_queue_ranked',
          jsonb_build_object('model', args->>'model', 'cards', v_count,
                             'input_tokens', args->>'input_tokens',
                             'output_tokens', args->>'output_tokens'));
  return v_run;
end $$;

create or replace function public.dismiss_attention_card(args jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_card uuid := (args->>'card_id')::uuid;
  target_org uuid;
begin
  select org_id into target_org from attention_cards where id = v_card;
  if target_org is null then raise exception 'not_found'; end if;
  if not is_supply(target_org) then raise exception 'not_allowed'; end if;

  update attention_cards
  set status = 'dismissed', dismissed_by = auth.uid(), dismissed_at = now(),
      dismiss_reason = nullif(trim(args->>'reason'), '')
  where id = v_card and status = 'open';

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'attention_card', v_card, 'user', auth.uid(), 'dismissed',
          jsonb_build_object('reason', args->>'reason'));
end $$;

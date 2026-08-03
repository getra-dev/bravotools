-- Test: SPEC 3.3 attention queue — signals, AI run log, cards (0034).
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('a77e0000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'supply@t27.local', now(), now()),
  ('a77e0000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker@t27.local', now(), now()),
  ('a77e0000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outsider@t27.local', now(), now());

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"a77e0000-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t27_ctx as
  select create_organization('T27 Attention Org') as org_id;

do $$
declare org uuid;
begin
  select org_id into org from t27_ctx;
  perform invite_member(org, 'worker@t27.local', 'worker');
  perform create_location(org, '{"name":"T27 Objektas","type":"site"}'::jsonb);
  perform create_vendor(org, jsonb_build_object('name', 'T27 Tiekejas', 'email', 'x@t27.lt'));
end $$;

-- ---------- faktų rinkimas gali tik supply ----------
set local request.jwt.claims =
  '{"sub":"a77e0000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare org uuid;
begin
  select org_id into org from t27_ctx;
  begin
    perform collect_attention_signals(org);
    raise exception 'FAIL: worker collected signals';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- ---------- sukuriam realias išimtis ----------
reset role;
create temporary table t27_order as select null::uuid as order_id, null::uuid as item_id;
do $$
declare org uuid; site uuid; vend uuid; oid uuid; item uuid;
begin
  select org_id into org from t27_ctx;
  select id into site from locations where org_id = org and type = 'site' limit 1;
  select id into vend from vendors where org_id = org limit 1;

  -- (a) patvirtintas, bet neišsiųstas užsakymas, senesnis nei 4 val.
  insert into orders (org_id, order_number, site_id, vendor_id, status, requested_by, created_at)
  values (org, 'BT-T27-0001', site, vend, 'approved',
          'a77e0000-0000-0000-0000-00000000000a', now() - interval '2 days')
  returning id into oid;
  -- (b) eilutė su praėjusiu ETA
  insert into order_items (order_id, description, quantity, unit, expected_date)
  values (oid, 'T27 Blokeliai', 100, 'vnt', current_date - 5)
  returning id into item;

  update t27_order set order_id = oid, item_id = item;

  -- (c) HOT poreikis, kuris kabo atviras
  insert into material_requests (org_id, site_id, requested_by, is_hot, hot_reason, status)
  values (org, site, 'a77e0000-0000-0000-0000-00000000000a', true, 'emergency', 'open');
end $$;
grant select on t27_ctx, t27_order to authenticated;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"a77e0000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare org uuid; sig jsonb; keys text[];
begin
  select org_id into org from t27_ctx;
  select collect_attention_signals(org) into sig;

  select array_agg(distinct value->>'signal_key') into keys
  from jsonb_array_elements(sig);

  if not ('unsent_order' = any(keys)) then
    raise exception 'FAIL: unsent order not detected: %', keys;
  end if;
  if not ('eta_overdue' = any(keys)) then
    raise exception 'FAIL: overdue ETA not detected: %', keys;
  end if;
  if not ('hot_request_open' = any(keys)) then
    raise exception 'FAIL: open HOT request not detected: %', keys;
  end if;

  -- faktai turi būti tikri, ne tušti
  if not exists (
    select 1 from jsonb_array_elements(sig) s
    where s->>'signal_key' = 'eta_overdue'
      and (s->'facts'->>'days_late')::int >= 5
  ) then
    raise exception 'FAIL: eta_overdue facts missing days_late';
  end if;
end $$;

-- ---------- kortelių įrašymas ----------
create temporary table t27_card as select null::uuid as card_id;
do $$
declare org uuid; oid uuid; run uuid;
begin
  select org_id into org from t27_ctx;
  select order_id into oid from t27_order;

  select save_attention_cards(jsonb_build_object(
    'org_id', org,
    'model', 'claude-opus-5',
    'input_tokens', '1200',
    'output_tokens', '300',
    'latency_ms', '4200',
    'cards', jsonb_build_array(jsonb_build_object(
      'signal_key', 'unsent_order',
      'entity_type', 'order',
      'entity_id', oid,
      'rank', 1,
      'severity', 'critical',
      'reason', 'BT-T27-0001 guli nepasiustas jau 2 dienas.',
      'actions', jsonb_build_array('send_order_email'),
      'facts', jsonb_build_object('order_number', 'BT-T27-0001')))
  )) into run;

  if (select count(*) from attention_cards where org_id = org and status = 'open') <> 1 then
    raise exception 'FAIL: card not stored';
  end if;
  if (select input_tokens from ai_runs where id = run) <> 1200 then
    raise exception 'FAIL: token usage not logged';
  end if;
  -- CLAUDE.md 9: AI veiksmas privalo turėti actor_type='ai' įrašą
  if not exists (
    select 1 from activity_log
    where entity_id = run and actor_type = 'ai' and action = 'attention_queue_ranked') then
    raise exception 'FAIL: AI action not in activity_log with actor_type=ai';
  end if;

  update t27_card set card_id = (
    select id from attention_cards where org_id = org and status = 'open' limit 1);
end $$;

-- ---------- atmesta kortelė nebegrįžta po pakartotinio reitingavimo ----------
do $$
declare org uuid; oid uuid; card uuid;
begin
  select org_id into org from t27_ctx;
  select order_id into oid from t27_order;
  select card_id into card from t27_card;

  perform dismiss_attention_card(jsonb_build_object('card_id', card, 'reason', 'zinau'));
  if (select status from attention_cards where id = card) <> 'dismissed' then
    raise exception 'FAIL: dismiss did not apply';
  end if;

  perform save_attention_cards(jsonb_build_object(
    'org_id', org, 'model', 'claude-opus-5',
    'cards', jsonb_build_array(jsonb_build_object(
      'signal_key', 'unsent_order', 'entity_type', 'order', 'entity_id', oid,
      'rank', 1, 'severity', 'critical', 'reason', 'ta pati kortele',
      'actions', jsonb_build_array('send_order_email')))));

  if exists (
    select 1 from attention_cards
    where org_id = org and status = 'open' and entity_id = oid
      and signal_key = 'unsent_order') then
    raise exception 'FAIL: dismissed card came back';
  end if;
end $$;

-- ---------- worker negali nei rašyti, nei atmesti ----------
set local request.jwt.claims =
  '{"sub":"a77e0000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare org uuid; card uuid;
begin
  select org_id into org from t27_ctx;
  select card_id into card from t27_card;
  begin
    perform save_attention_cards(jsonb_build_object('org_id', org, 'model', 'x'));
    raise exception 'FAIL: worker saved cards';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
  begin
    perform dismiss_attention_card(jsonb_build_object('card_id', card));
    raise exception 'FAIL: worker dismissed a card';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;
end $$;

-- ---------- svetimas nemato nei kortelių, nei AI žurnalo ----------
set local request.jwt.claims =
  '{"sub":"a77e0000-0000-0000-0000-00000000000c","role":"authenticated"}';
do $$
declare org uuid;
begin
  select org_id into org from t27_ctx;
  if (select count(*) from attention_cards where org_id = org) <> 0 then
    raise exception 'FAIL: outsider reads attention cards';
  end if;
  if (select count(*) from ai_runs where org_id = org) <> 0 then
    raise exception 'FAIL: outsider reads ai runs';
  end if;
end $$;

reset role;
rollback;
